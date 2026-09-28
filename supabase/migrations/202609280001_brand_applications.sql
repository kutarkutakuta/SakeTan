alter table public.brands
  add column registration_status text not null default 'approved',
  add column requested_brewery_name text,
  add column registered_at timestamptz default now(),
  add column merged_into_brand_id uuid references public.brands(id),
  add constraint brands_registration_status_check
    check(registration_status in ('pending','approved','rejected','merged')),
  add constraint brands_requested_brewery_name_check
    check(
      requested_brewery_name is null
      or length(trim(requested_brewery_name)) between 1 and 150
    );

update public.brands set registered_at=created_at;

create index brands_registration_status_idx
  on public.brands(registration_status,created_at desc);

create table public.brand_applications (
  brand_id uuid primary key references public.brands(id),
  reason text check(reason is null or length(reason)<=500),
  resolution text not null default 'pending'
    check(resolution in ('pending','approved','merged','rejected')),
  target_brand_id uuid references public.brands(id),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

alter table public.brand_applications enable row level security;
create policy read_own_or_admin_brand_applications
  on public.brand_applications for select
  using(
    public.is_admin()
    or exists(
      select 1 from public.brands b
      where b.id=brand_id and b.created_by=auth.uid()
    )
  );
revoke all on public.brand_applications from anon,authenticated;
grant select on public.brand_applications to authenticated;
grant all on public.brand_applications to service_role;

alter table public.brand_requests
  add column migrated_brand_id uuid references public.brands(id);

do $$
declare request_row record; pending_brand_id uuid;
begin
  for request_row in
    select * from public.brand_requests
    where status='pending' and migrated_brand_id is null
    order by created_at,id
  loop
    select b.id into pending_brand_id
    from public.brands b
    where b.registration_status='pending'
      and lower(trim(b.name))=lower(trim(request_row.name))
      and lower(trim(coalesce(b.requested_brewery_name,'')))=
          lower(trim(coalesce(request_row.brewery_name,'')))
    order by b.created_at
    limit 1;

    if pending_brand_id is null then
      insert into public.brands(
        name,requested_brewery_name,registration_status,registered_at,
        created_by,is_active,created_at,updated_at
      ) values(
        trim(request_row.name),nullif(trim(request_row.brewery_name),''),
        'pending',null,request_row.submitted_by,true,
        request_row.created_at,request_row.created_at
      ) returning id into pending_brand_id;

      insert into public.brand_applications(brand_id,reason,created_at)
      values(pending_brand_id,request_row.note,request_row.created_at);
    end if;

    if request_row.shop_id is not null then
      insert into public.shop_brands(
        shop_id,brand_id,created_by,is_active,status,created_at,updated_at
      ) values(
        request_row.shop_id,pending_brand_id,request_row.submitted_by,
        true,'available',request_row.created_at,request_row.created_at
      ) on conflict(shop_id,brand_id) do nothing;
    end if;

    update public.brand_requests
    set migrated_brand_id=pending_brand_id
    where id=request_row.id;
  end loop;
end $$;

create function public.submit_brand_application(
  p_name text,
  p_brewery_name text,
  p_reason text,
  p_shop_id uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  normalized_name text:=trim(p_name);
  normalized_brewery text:=trim(p_brewery_name);
  normalized_reason text:=nullif(trim(p_reason),'');
  result_id uuid;
  recent_count integer;
begin
  if auth.uid() is null then
    raise exception '操作ユーザーを確認できません' using errcode='42501';
  end if;
  if length(normalized_name) not between 1 and 150 then
    raise exception '銘柄名を入力してください';
  end if;
  if length(normalized_brewery) not between 1 and 150 then
    raise exception '酒蔵名を入力してください';
  end if;
  if length(coalesce(normalized_reason,''))>500 then
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
      and lower(trim(coalesce(w.name,'')))=lower(normalized_brewery)
  ) then
    raise exception '同じ銘柄と酒蔵がすでに登録されています' using errcode='P0001';
  end if;

  select b.id into result_id
  from public.brands b
  where b.registration_status='pending' and b.is_active
    and lower(trim(b.name))=lower(normalized_name)
    and lower(trim(coalesce(b.requested_brewery_name,'')))=lower(normalized_brewery)
  order by b.created_at
  limit 1
  for update;

  if result_id is null then
    perform set_config('saketan.reason','銘柄登録を申請',true);
    insert into public.brands(
      name,requested_brewery_name,registration_status,registered_at,
      created_by,is_active
    ) values(
      normalized_name,normalized_brewery,'pending',null,auth.uid(),true
    ) returning id into result_id;
    insert into public.brand_applications(brand_id,reason)
    values(result_id,normalized_reason);
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

create function public.review_brand_application(
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

create function public.restore_master_kana(p_history_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  history_row public.change_histories;
  current_kana text;
  expected_kana text;
  previous_kana text;
begin
  if auth.uid() is null or public.is_anonymous_user() then
    raise exception 'ログインしてください' using errcode='42501';
  end if;
  select * into history_row from public.change_histories
  where id=p_history_id and entity_type in ('brand','brewery');
  if history_row.id is null
    or history_row.before_data is null
    or not (history_row.before_data ? 'name_kana')
    or not (history_row.after_data ? 'name_kana')
    or (history_row.before_data->'name_kana') is not distinct from
       (history_row.after_data->'name_kana')
  then
    raise exception 'かなの変更履歴が見つかりません';
  end if;
  expected_kana=nullif(history_row.after_data->>'name_kana','');
  previous_kana=nullif(history_row.before_data->>'name_kana','');
  if history_row.entity_type='brand' then
    select name_kana into current_kana from public.brands
    where id=history_row.entity_id for update;
  else
    select name_kana into current_kana from public.breweries
    where id=history_row.entity_id for update;
  end if;
  if not found then raise exception '対象が見つかりません'; end if;
  if current_kana is distinct from expected_kana then
    raise exception 'この後にかなが変更されています。最新の履歴を確認してください'
      using errcode='P0001';
  end if;
  return public.update_master_kana(
    history_row.entity_type,history_row.entity_id,previous_kana,
    '履歴 '||history_row.id||' のかなに復元'
  );
end $$;

drop function public.search_brands(text);
create function public.search_brands(p_query text default '')
returns table(
  id uuid,name text,name_kana text,brewery_id uuid,brewery_name text,
  prefecture text,registration_status text,requested_brewery_name text,
  registered_at timestamptz
)
language sql stable security invoker set search_path='' as $$
with candidates as (
  select
    b.id,b.name,b.name_kana,b.brewery_id,
    coalesce(w.name,b.requested_brewery_name) as brewery_name,
    w.name_kana as brewery_name_kana,w.prefecture,b.registration_status,
    b.requested_brewery_name,b.registered_at,
    lower(trim(coalesce(p_query,''))) as query
  from public.brands b
  left join public.breweries w on w.id=b.brewery_id
  where b.is_active and b.registration_status in ('pending','approved')
    and (
      lower(trim(coalesce(p_query,'')))=''
      or position(lower(trim(p_query)) in lower(b.name))>0
      or position(lower(trim(p_query)) in lower(coalesce(b.name_kana,'')))>0
      or position(lower(trim(p_query)) in lower(coalesce(w.name,'')))>0
      or position(lower(trim(p_query)) in lower(coalesce(w.name_kana,'')))>0
      or position(lower(trim(p_query)) in lower(coalesce(b.requested_brewery_name,'')))>0
    )
)
select
  c.id,c.name,c.name_kana,c.brewery_id,c.brewery_name,c.prefecture,
  c.registration_status,c.requested_brewery_name,c.registered_at
from candidates c
order by
  case
    when c.query='' then 9
    when lower(c.name)=c.query then 0
    when lower(coalesce(c.name_kana,''))=c.query then 1
    when position(c.query in lower(c.name))=1 then 2
    when position(c.query in lower(coalesce(c.name_kana,'')))=1 then 3
    when lower(coalesce(c.brewery_name,''))=c.query then 4
    when lower(coalesce(c.brewery_name_kana,''))=c.query then 5
    when position(c.query in lower(c.name))>0 then 6
    when position(c.query in lower(coalesce(c.name_kana,'')))>0 then 7
    when position(c.query in lower(coalesce(c.brewery_name,'')))>0 then 8
    else 9
  end,
  c.name
limit 100;
$$;

create or replace function public.get_my_contribution_summary() returns jsonb
language sql stable security definer set search_path='' as $$
  with valid_relations as (
    select sb.shop_id,sb.created_at
    from public.shop_brands sb
    join public.shops s on s.id=sb.shop_id and s.is_active
    join public.brands b on b.id=sb.brand_id and b.is_active
    where auth.uid() is not null
      and sb.created_by=auth.uid()
      and sb.status in ('available','unavailable')
  ), favorite_shops as (
    select
      s.id as shop_id,s.name as shop_name,
      count(*)::integer as contribution_count,
      max(vr.created_at) as last_contribution_at
    from valid_relations vr
    join public.shops s on s.id=vr.shop_id
    group by s.id,s.name
    having count(*)>=2
    order by count(*) desc,max(vr.created_at) desc,s.name
    limit 3
  )
  select jsonb_build_object(
    'shop_brand_count',(select count(*)::integer from valid_relations),
    'shop_count',(
      select count(*)::integer from public.shops s
      where auth.uid() is not null and s.created_by=auth.uid() and s.is_active
    ),
    'approved_brand_application_count',(
      select count(*)::integer from public.brands b
      join public.brand_applications a on a.brand_id=b.id
      where auth.uid() is not null and b.created_by=auth.uid()
        and a.resolution='approved'
    ),
    'resolved_brand_request_count',(
      select count(*)::integer from public.brand_requests br
      where auth.uid() is not null
        and br.submitted_by=auth.uid() and br.status='resolved'
    ),
    'favorite_shops',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'shop_id',fs.shop_id,'shop_name',fs.shop_name,
          'contribution_count',fs.contribution_count
        ) order by fs.contribution_count desc,fs.last_contribution_at desc,fs.shop_name
      ) from favorite_shops fs
    ),'[]'::jsonb)
  );
$$;

create or replace function public.restore_history(p_history_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare h public.change_histories; payload jsonb; target public.shop_brands; restored_status text;
begin
  if not public.is_admin() then
    raise exception '管理者のみ復元できます' using errcode='42501';
  end if;
  select * into h from public.change_histories where id=p_history_id;
  if h.id is null or h.after_data is null then raise exception '履歴が見つかりません'; end if;
  perform set_config('saketan.restore','true',true);
  if h.entity_type='shop_brand' then
    select * into target from public.shop_brands where id=h.entity_id for update;
    restored_status=coalesce(
      h.after_data->>'status',
      case when (h.after_data->>'is_active')::boolean then 'available' else 'incorrect' end
    );
    update public.shop_brands set
      status=restored_status,is_active=(restored_status='available'),
      first_seen_at=(select min(observed_at) from public.sightings where shop_brand_id=target.id and not is_deleted),
      last_seen_at=(select max(observed_at) from public.sightings where shop_brand_id=target.id and not is_deleted)
    where id=target.id;
  else
    payload=h.after_data-array[
      'id','source','source_id','source_url','external_url','address',
      'created_by','created_at','updated_at','registration_status',
      'requested_brewery_name','registered_at','merged_into_brand_id'
    ];
    if h.entity_type='shop' then payload=payload-'website_url'; end if;
    perform public.save_master(
      h.entity_type,h.entity_id,payload,'履歴 '||h.id||' の状態に復元'
    );
  end if;
  perform set_config('saketan.restore','false',true);
end $$;

revoke execute on function public.submit_brand_application(text,text,text,uuid),
  public.review_brand_application(uuid,text,uuid),
  public.restore_master_kana(uuid)
from public,anon,authenticated;
grant execute on function public.submit_brand_application(text,text,text,uuid),
  public.restore_master_kana(uuid)
to authenticated;
grant execute on function public.review_brand_application(uuid,text,uuid)
to authenticated;
revoke execute on function public.search_brands(text) from public,anon,authenticated;
grant execute on function public.search_brands(text) to anon,authenticated;

drop function public.shop_brand_previews(uuid[],integer);
create function public.shop_brand_previews(
  p_shop_ids uuid[],
  p_limit integer default 10
) returns table(
  shop_id uuid,
  total bigint,
  brand_id uuid,
  brand_name text,
  brand_name_kana text,
  brewery_id uuid,
  sakenowa_rank integer,
  sakenowa_score double precision,
  sakenowa_rank_year_month text,
  registration_status text
)
language sql stable security invoker set search_path='' as $$
  with ranked as (
    select
      sb.shop_id,
      count(*) over(partition by sb.shop_id) as total,
      b.id as brand_id,
      b.name as brand_name,
      b.name_kana as brand_name_kana,
      b.brewery_id,
      b.sakenowa_rank,
      b.sakenowa_score,
      b.sakenowa_rank_year_month,
      b.registration_status,
      row_number() over(
        partition by sb.shop_id
        order by
          (b.registration_status='pending') desc,
          b.sakenowa_rank asc nulls last,
          sb.last_seen_at desc nulls last,
          b.id
      ) as position
    from public.shop_brands sb
    join public.brands b on b.id=sb.brand_id and b.is_active
    where sb.shop_id=any(p_shop_ids) and sb.is_active
  )
  select
    ranked.shop_id,ranked.total,ranked.brand_id,ranked.brand_name,
    ranked.brand_name_kana,ranked.brewery_id,ranked.sakenowa_rank,
    ranked.sakenowa_score,ranked.sakenowa_rank_year_month,
    ranked.registration_status
  from ranked
  where ranked.position<=least(greatest(p_limit,1),20)
  order by ranked.shop_id,ranked.position;
$$;

revoke execute on function public.shop_brand_previews(uuid[],integer)
from public,anon,authenticated;
grant execute on function public.shop_brand_previews(uuid[],integer)
to anon,authenticated;

revoke execute on function public.submit_brand_request(text,text,text,uuid),
  public.review_brand_request(uuid,text)
from public,anon,authenticated;
