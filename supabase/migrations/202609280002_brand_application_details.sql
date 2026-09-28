alter table public.brands
  add column requested_name_kana text,
  add constraint brands_requested_name_kana_check
    check(
      requested_name_kana is null
      or length(trim(requested_name_kana)) between 1 and 150
    );

create or replace function public.submit_brand_application_v2(
  p_name text,
  p_name_kana text,
  p_brewery_id uuid,
  p_brewery_name text,
  p_reason text,
  p_shop_id uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  normalized_name text:=trim(p_name);
  normalized_kana text:=nullif(trim(coalesce(p_name_kana,'')),'');
  normalized_brewery text:=trim(coalesce(p_brewery_name,''));
  requested_brewery_id uuid:=p_brewery_id;
  result_id uuid;
  recent_count integer;
begin
  if auth.uid() is null then
    raise exception '操作ユーザーを確認できません' using errcode='42501';
  end if;
  if length(normalized_name) not between 1 and 150 then
    raise exception '銘柄名を入力してください';
  end if;
  if length(coalesce(normalized_kana,''))>150 then
    raise exception '銘柄かなは150文字以内で入力してください';
  end if;
  if requested_brewery_id is not null then
    select name into normalized_brewery
    from public.breweries
    where id=requested_brewery_id and is_active;
    if not found then
      raise exception '選択した酒蔵が見つかりません';
    end if;
  elsif length(normalized_brewery) not between 1 and 150 then
    raise exception '酒蔵名を入力してください';
  end if;
  if length(coalesce(trim(p_reason),''))>500 then
    raise exception '申請理由は500文字以内で入力してください';
  end if;
  perform 1 from public.shops where id=p_shop_id and is_active for share;
  if not found then raise exception '酒屋が見つかりません'; end if;

  select count(*)::integer into recent_count
  from public.brands b
  where b.created_by=auth.uid()
    and b.registration_status='pending'
    and b.created_at>now()-interval '1 hour';
  if public.is_anonymous_user() and recent_count>=10 then
    raise exception '短時間の申請回数が上限に達しました。時間をおいてお試しください';
  end if;

  if exists(
    select 1
    from public.brands b
    left join public.breweries w on w.id=b.brewery_id
    where b.registration_status='approved' and b.is_active
      and lower(trim(b.name))=lower(normalized_name)
      and (
        (requested_brewery_id is not null and b.brewery_id=requested_brewery_id)
        or (requested_brewery_id is null and lower(trim(coalesce(w.name,'')))=lower(normalized_brewery))
      )
  ) then
    raise exception '同じ銘柄と酒蔵がすでに登録されています' using errcode='P0001';
  end if;

  select b.id into result_id
  from public.brands b
  where b.registration_status='pending' and b.is_active
    and lower(trim(b.name))=lower(normalized_name)
    and (
      (requested_brewery_id is not null and b.brewery_id=requested_brewery_id)
      or (
        requested_brewery_id is null
        and b.brewery_id is null
        and lower(trim(coalesce(b.requested_brewery_name,'')))=lower(normalized_brewery)
      )
    )
  order by b.created_at
  limit 1
  for update;

  if result_id is null then
    perform set_config('saketan.reason','銘柄登録を申請',true);
    insert into public.brands(
      name,requested_name_kana,brewery_id,requested_brewery_name,
      registration_status,registered_at,created_by,is_active
    ) values(
      normalized_name,normalized_kana,requested_brewery_id,
      case when requested_brewery_id is null then normalized_brewery else null end,
      'pending',null,auth.uid(),true
    ) returning id into result_id;
    insert into public.brand_applications(brand_id,reason)
    values(result_id,nullif(trim(p_reason),''));
  else
    update public.brands
    set requested_name_kana=coalesce(requested_name_kana,normalized_kana)
    where id=result_id and requested_name_kana is null and normalized_kana is not null;
  end if;

  perform set_config('saketan.reason','申請中銘柄を取扱ありとして追加',true);
  insert into public.shop_brands(
    shop_id,brand_id,created_by,is_active,status
  ) values(
    p_shop_id,result_id,auth.uid(),true,'available'
  ) on conflict(shop_id,brand_id) do update set
    is_active=true,status='available';
  return result_id;
end $$;

create or replace function public.submit_brand_application(
  p_name text,
  p_brewery_name text,
  p_reason text,
  p_shop_id uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  return public.submit_brand_application_v2(
    p_name,null,null,p_brewery_name,p_reason,p_shop_id
  );
end $$;

create or replace function public.review_brand_application(
  p_brand_id uuid,
  p_action text,
  p_target_brand_id uuid default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  pending_brand public.brands;
  resolved_brewery_id uuid;
  source_relation public.shop_brands;
  destination_relation public.shop_brands;
  merged_status text;
begin
  if not public.is_admin() then
    raise exception '管理者のみ確認できます' using errcode='42501';
  end if;
  if p_action not in ('approve','merge','reject') then
    raise exception '確認内容が不正です';
  end if;

  select * into pending_brand from public.brands
  where id=p_brand_id and registration_status='pending'
  for update;
  if pending_brand.id is null then
    raise exception '申請中の銘柄が見つかりません';
  end if;

  if p_action='approve' then
    resolved_brewery_id:=pending_brand.brewery_id;
    if resolved_brewery_id is not null then
      perform 1 from public.breweries
      where id=resolved_brewery_id and is_active;
      if not found then
        raise exception '紐付け先の酒蔵が見つかりません';
      end if;
    else
      select id into resolved_brewery_id from public.breweries
      where is_active
        and lower(trim(name))=lower(trim(pending_brand.requested_brewery_name))
      order by (source is not null) desc,created_at
      limit 1;
      if resolved_brewery_id is null then
        perform set_config('saketan.reason','銘柄申請の承認に伴い酒蔵を登録',true);
        insert into public.breweries(name,created_by)
        values(trim(pending_brand.requested_brewery_name),auth.uid())
        returning id into resolved_brewery_id;
      end if;
    end if;
    if exists(
      select 1 from public.brands b
      where b.id<>p_brand_id and b.registration_status='approved' and b.is_active
        and b.brewery_id=resolved_brewery_id
        and lower(trim(b.name))=lower(trim(pending_brand.name))
    ) then
      raise exception '同じ銘柄が登録済みです。既存銘柄へ統合してください'
        using errcode='P0001';
    end if;
    perform set_config('saketan.reason','銘柄登録申請を承認',true);
    update public.brands set
      name_kana=coalesce(nullif(trim(pending_brand.requested_name_kana),''),name_kana),
      requested_name_kana=null,
      brewery_id=resolved_brewery_id,
      requested_brewery_name=null,
      registration_status='approved',
      registered_at=now(),
      merged_into_brand_id=null,
      is_active=true
    where id=p_brand_id;
    update public.brand_applications set
      resolution='approved',reviewed_at=now(),reviewed_by=auth.uid(),
      target_brand_id=null
    where brand_id=p_brand_id;
    return p_brand_id;
  end if;

  if p_action='reject' then
    perform set_config('saketan.reason','銘柄登録申請を却下',true);
    update public.shop_brands
    set status='incorrect',is_active=false
    where brand_id=p_brand_id;
    update public.brands set
      registration_status='rejected',is_active=false
    where id=p_brand_id;
    update public.brand_applications set
      resolution='rejected',reviewed_at=now(),reviewed_by=auth.uid(),
      target_brand_id=null
    where brand_id=p_brand_id;
    return p_brand_id;
  end if;

  perform 1 from public.brands
  where id=p_target_brand_id and registration_status='approved' and is_active
  for share;
  if not found or p_target_brand_id=p_brand_id then
    raise exception '統合先の登録済み銘柄を確認してください';
  end if;

  perform set_config('saketan.reason','申請中銘柄を既存銘柄へ統合',true);
  for source_relation in
    select * from public.shop_brands
    where brand_id=p_brand_id
    order by id
    for update
  loop
    select * into destination_relation from public.shop_brands
    where shop_id=source_relation.shop_id and brand_id=p_target_brand_id
    for update;
    if destination_relation.id is null then
      update public.shop_brands
      set brand_id=p_target_brand_id
      where id=source_relation.id;
    else
      update public.sightings
      set shop_brand_id=destination_relation.id
      where shop_brand_id=source_relation.id;
      merged_status=case
        when destination_relation.status='available' or source_relation.status='available'
          then 'available'
        when destination_relation.status='unavailable' or source_relation.status='unavailable'
          then 'unavailable'
        else 'incorrect'
      end;
      update public.shop_brands set
        status=merged_status,
        is_active=(merged_status='available'),
        first_seen_at=case
          when destination_relation.first_seen_at is null then source_relation.first_seen_at
          when source_relation.first_seen_at is null then destination_relation.first_seen_at
          else least(destination_relation.first_seen_at,source_relation.first_seen_at)
        end,
        last_seen_at=case
          when destination_relation.last_seen_at is null then source_relation.last_seen_at
          when source_relation.last_seen_at is null then destination_relation.last_seen_at
          else greatest(destination_relation.last_seen_at,source_relation.last_seen_at)
        end
      where id=destination_relation.id;
      delete from public.shop_brands where id=source_relation.id;
    end if;
  end loop;

  update public.brands set
    registration_status='merged',merged_into_brand_id=p_target_brand_id,
    is_active=false
  where id=p_brand_id;
  update public.brand_applications set
    resolution='merged',target_brand_id=p_target_brand_id,
    reviewed_at=now(),reviewed_by=auth.uid()
  where brand_id=p_brand_id;
  return p_target_brand_id;
end $$;

revoke execute on function public.submit_brand_application_v2(text,text,uuid,text,text,uuid)
from public,anon,authenticated;
grant execute on function public.submit_brand_application_v2(text,text,uuid,text,text,uuid)
to authenticated;
