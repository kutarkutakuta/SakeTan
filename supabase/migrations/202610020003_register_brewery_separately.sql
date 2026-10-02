drop function public.review_brand_application(uuid,text,uuid,uuid,text,text,text,text);

create function public.review_brand_application(
  p_brand_id uuid,
  p_action text,
  p_target_brand_id uuid default null,
  p_brewery_id uuid default null,
  p_brewery_name text default null,
  p_brewery_name_kana text default null,
  p_brewery_prefecture text default null,
  p_brewery_website_url text default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  pending_brand public.brands;
  resolved_brewery_id uuid;
  duplicate_brewery_id uuid;
  normalized_brewery_name text:=trim(coalesce(p_brewery_name,''));
  normalized_brewery_kana text:=nullif(trim(coalesce(p_brewery_name_kana,'')),'');
  normalized_brewery_prefecture text:=trim(coalesce(p_brewery_prefecture,''));
  normalized_brewery_website text:=nullif(trim(coalesce(p_brewery_website_url,'')),'');
  source_relation public.shop_brands;
  destination_relation public.shop_brands;
  merged_status text;
begin
  if not public.is_admin() then
    raise exception '管理者のみ確認できます' using errcode='42501';
  end if;
  if p_action not in ('approve','register_brewery','merge','reject') then
    raise exception '確認内容が不正です';
  end if;

  select * into pending_brand from public.brands
  where id=p_brand_id and registration_status='pending'
  for update;
  if pending_brand.id is null then
    raise exception '申請中の銘柄が見つかりません';
  end if;

  if p_action='register_brewery' then
    if pending_brand.brewery_id is not null then
      raise exception 'この銘柄にはすでに酒蔵が紐付いています';
    end if;
    if length(normalized_brewery_name) not between 1 and 150 then
      raise exception '登録する酒蔵名を入力してください';
    end if;
    if length(coalesce(normalized_brewery_kana,''))>150 then
      raise exception '酒蔵かなは150文字以内で入力してください';
    end if;
    if normalized_brewery_prefecture<>all(array[
      '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
      '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
      '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
      '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
      '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
      '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
      '熊本県','大分県','宮崎県','鹿児島県','沖縄県'
    ]) then
      raise exception '都道府県を選択してください';
    end if;
    if normalized_brewery_website is not null
      and normalized_brewery_website!~'^https?://'
    then
      raise exception '公式サイトはhttpまたはhttpsのURLを入力してください';
    end if;
    select id into duplicate_brewery_id from public.breweries
    where is_active
      and lower(trim(name))=lower(normalized_brewery_name)
      and lower(trim(coalesce(prefecture,'')))=
          lower(normalized_brewery_prefecture)
    order by (source is not null) desc,created_at
    limit 1;
    if duplicate_brewery_id is not null then
      raise exception '同名・同都道府県の酒蔵が登録済みです。既存酒蔵を選択してください'
        using errcode='P0001';
    end if;
    perform set_config('saketan.reason','銘柄申請から酒蔵のみ登録',true);
    insert into public.breweries(
      name,name_kana,prefecture,website_url,created_by,is_active
    ) values(
      normalized_brewery_name,normalized_brewery_kana,
      normalized_brewery_prefecture,normalized_brewery_website,
      auth.uid(),true
    ) returning id into resolved_brewery_id;
    perform set_config('saketan.reason','酒蔵登録後も銘柄申請を承認待ちに保持',true);
    update public.brands
    set brewery_id=resolved_brewery_id,requested_brewery_name=null
    where id=p_brand_id;
    return p_brand_id;
  end if;

  if p_action='approve' then
    resolved_brewery_id:=pending_brand.brewery_id;
    if resolved_brewery_id is not null then
      perform 1 from public.breweries
      where id=resolved_brewery_id and is_active;
      if not found then
        raise exception '紐付け先の酒蔵が見つかりません';
      end if;
    elsif p_brewery_id is not null then
      if normalized_brewery_name<>''
        or normalized_brewery_kana is not null
        or normalized_brewery_prefecture<>''
        or normalized_brewery_website is not null
      then
        raise exception '既存酒蔵の選択と新規酒蔵の入力は同時に指定できません';
      end if;
      select id into resolved_brewery_id from public.breweries
      where id=p_brewery_id and is_active
      for share;
      if resolved_brewery_id is null then
        raise exception '選択した酒蔵が見つかりません';
      end if;
    else
      raise exception '先に酒蔵を登録するか、既存酒蔵を選択してください'
        using errcode='P0001';
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

revoke execute on function public.review_brand_application(
  uuid,text,uuid,uuid,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.review_brand_application(
  uuid,text,uuid,uuid,text,text,text,text
) to authenticated;


