alter table public.users
  add column is_anonymous boolean not null default false,
  add column name_is_custom boolean not null default false;

update public.users u
set is_anonymous=coalesce(a.is_anonymous,false)
from auth.users a
where a.id=u.id;

create or replace function public.sync_auth_user() returns trigger
language plpgsql security definer set search_path='' as $$
declare provider_name text;
begin
  provider_name=coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'),''),
    nullif(trim(new.raw_user_meta_data->>'name'),''),
    '匿名ユーザー'
  );
  insert into public.users(id,name,email,image_url,is_anonymous)
  values(
    new.id,provider_name,coalesce(new.email,''),
    new.raw_user_meta_data->>'avatar_url',coalesce(new.is_anonymous,false)
  )
  on conflict(id) do update set
    name=case
      when public.users.name_is_custom then public.users.name
      else excluded.name
    end,
    email=excluded.email,
    image_url=excluded.image_url,
    is_anonymous=excluded.is_anonymous,
    updated_at=now();
  return new;
end $$;

drop trigger sync_auth_user on auth.users;
create trigger sync_auth_user
after insert or update of email,raw_user_meta_data,is_anonymous on auth.users
for each row execute function public.sync_auth_user();

alter table public.shop_brands add column status text;
update public.shop_brands
set status=case when is_active then 'available' else 'incorrect' end;
alter table public.shop_brands
  alter column status set default 'available',
  alter column status set not null,
  add constraint shop_brands_status_check
    check(status in ('available','unavailable','incorrect'));
create index shop_brands_available_status_idx
  on public.shop_brands(shop_id,brand_id) where status='available';

create table public.brand_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 1 and 150),
  brewery_name text check(brewery_name is null or length(trim(brewery_name)) between 1 and 150),
  note text check(note is null or length(note)<=500),
  shop_id uuid references public.shops(id),
  submitted_by uuid not null references public.users(id),
  status text not null default 'pending' check(status in ('pending','resolved','dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id)
);
create index brand_requests_pending_idx
  on public.brand_requests(created_at desc) where status='pending';
alter table public.brand_requests enable row level security;
create policy read_own_or_admin_brand_requests on public.brand_requests
for select using(submitted_by=auth.uid() or public.is_admin());
revoke all on public.brand_requests from anon,authenticated;
grant select on public.brand_requests to authenticated;
grant all on public.brand_requests to service_role;

create or replace function public.is_anonymous_user() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((
    select u.is_anonymous from public.users u where u.id=auth.uid()
  ),false);
$$;

create or replace function public.assert_change_quota(p_max integer) returns void
language plpgsql security definer set search_path='' as $$
declare recent_count integer;
begin
  if auth.uid() is null then
    raise exception '操作ユーザーを確認できません' using errcode='42501';
  end if;
  select count(*)::integer into recent_count
  from public.change_histories
  where changed_by=auth.uid() and created_at>now()-interval '1 hour';
  if recent_count>=p_max then
    raise exception '短時間の変更回数が上限に達しました。時間をおいてお試しください'
      using errcode='P0001';
  end if;
end $$;

create or replace function public.audit_master() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous jsonb; current_data jsonb; verb text; kind text;
begin
  new.updated_at=now();
  if auth.uid() is null then return new; end if;
  current_data=to_jsonb(new);
  previous=case when tg_op='UPDATE' then to_jsonb(old) else null end;
  if previous is not null
    and (previous-'updated_at')=(current_data-'updated_at')
    and coalesce(current_setting('saketan.restore',true),'')<>'true'
  then return new; end if;
  kind=case tg_table_name
    when 'breweries' then 'brewery'
    when 'brands' then 'brand'
    when 'shops' then 'shop'
    else 'shop_brand'
  end;
  verb=case
    when current_setting('saketan.restore',true)='true' then 'restore'
    when tg_op='INSERT' then 'create'
    when tg_table_name<>'shop_brands' and old.is_active and not new.is_active then 'deactivate'
    else 'update'
  end;
  insert into public.change_histories(
    entity_type,entity_id,action,before_data,after_data,changed_by,reason
  ) values(
    kind,new.id,verb,previous,current_data,auth.uid(),
    nullif(current_setting('saketan.reason',true),'')
  );
  return new;
end $$;

create or replace function public.save_master(
  p_type text,
  p_id uuid,
  p_data jsonb,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  tab text; allowed text[]; field text; columns_sql text='';
  values_sql text=''; updates_sql text=''; result_id uuid; previous jsonb;
begin
  if auth.uid() is null or public.is_anonymous_user() then
    raise exception 'ログインしてください' using errcode='42501';
  end if;
  if p_type in ('brand','brewery') then
    if p_id is null then
      raise exception '銘柄と酒蔵の登録は、さけのわ同期からのみ行えます'
        using errcode='42501';
    end if;
    if not public.is_admin() then
      raise exception '銘柄と酒蔵は管理者だけ編集できます'
        using errcode='42501';
    end if;
  end if;
  case p_type
    when 'brewery' then
      tab='breweries'; allowed=array['name','name_kana','prefecture','website_url','is_active'];
    when 'brand' then
      tab='brands'; allowed=array['name','name_kana','brewery_id','is_active'];
    when 'shop' then
      tab='shops';
      allowed=array[
        'name','name_kana','prefecture','city','latitude','longitude',
        'website_url','google_place_id','is_active','geocode_source',
        'geocode_precision','geocoded_at'
      ];
      if p_data->>'geocode_source'='google' then
        p_data=p_data||jsonb_build_object('geocoded_at',now());
      end if;
    else raise exception '編集対象が不正です';
  end case;
  if jsonb_typeof(p_data)<>'object' or p_data='{}'::jsonb then
    raise exception '入力が空です';
  end if;
  for field in select jsonb_object_keys(p_data) loop
    if not field=any(allowed) then
      raise exception '変更できない項目です: %',field;
    end if;
    if field='geocoded_at'
      and p_data->>'geocoded_at' is not null
      and p_data->>'geocode_source' is distinct from 'google'
    then raise exception '位置情報の取得日時は直接変更できません'; end if;
    columns_sql=columns_sql||format('%I,',field);
    values_sql=values_sql||format('r.%I,',field);
    updates_sql=updates_sql||format('%I=r.%I,',field,field);
  end loop;
  perform set_config('saketan.reason',coalesce(p_reason,''),true);
  if p_id is null then
    execute format(
      'insert into public.%I(%screated_by) select %s$2 from jsonb_populate_record(null::public.%I,$1) r returning id',
      tab,columns_sql,values_sql,tab
    ) using p_data,auth.uid() into result_id;
  else
    execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab)
      using p_id into previous;
    if previous is null then raise exception '対象が見つかりません'; end if;
    execute format(
      'update public.%I t set %supdated_at=now() from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning t.id',
      tab,updates_sql,tab
    ) using p_data,p_id into result_id;
  end if;
  return result_id;
end $$;

create function public.set_shop_brand_status(
  p_shop_id uuid,
  p_brand_id uuid,
  p_status text,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.shop_brands;
begin
  if auth.uid() is null then
    raise exception '操作ユーザーを確認できません' using errcode='42501';
  end if;
  if p_status not in ('available','unavailable','incorrect') then
    raise exception '取扱状況が不正です';
  end if;
  perform public.assert_change_quota(case when public.is_anonymous_user() then 60 else 240 end);
  select * into target from public.shop_brands
  where shop_id=p_shop_id and brand_id=p_brand_id for update;
  perform set_config('saketan.reason',coalesce(p_reason,''),true);
  if target.id is null then
    if p_status<>'available' then
      raise exception '取扱情報が見つかりません';
    end if;
    perform 1 from public.shops where id=p_shop_id and is_active for share;
    if not found then raise exception '酒屋が見つかりません'; end if;
    perform 1 from public.brands where id=p_brand_id and is_active for share;
    if not found then raise exception '銘柄が見つかりません'; end if;
    insert into public.shop_brands(
      shop_id,brand_id,created_by,is_active,status
    ) values(
      p_shop_id,p_brand_id,auth.uid(),true,'available'
    ) on conflict(shop_id,brand_id) do update set
      is_active=true,status='available'
    returning id into target.id;
    return target.id;
  end if;
  update public.shop_brands
  set status=p_status,is_active=(p_status='available')
  where id=target.id;
  return target.id;
end $$;

create or replace function public.remove_shop_brand(p_shop_id uuid,p_brand_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  return public.set_shop_brand_status(
    p_shop_id,p_brand_id,'incorrect','旧画面から取扱情報を取り消し'
  );
end $$;

create or replace function public.post_sighting(
  p_shop_id uuid,p_brand_id uuid,p_observed_at date,p_comment text default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare relation_id uuid; result_id uuid;
begin
  if auth.uid() is null then
    raise exception '操作ユーザーを確認できません' using errcode='42501';
  end if;
  perform public.assert_change_quota(case when public.is_anonymous_user() then 60 else 240 end);
  if p_observed_at is null or p_observed_at>(now() at time zone 'Asia/Tokyo')::date then
    raise exception '見つけた日を確認してください';
  end if;
  perform 1 from public.shops where id=p_shop_id and is_active for share;
  if not found then raise exception '酒屋が見つかりません'; end if;
  perform 1 from public.brands where id=p_brand_id and is_active for share;
  if not found then raise exception '銘柄が見つかりません'; end if;
  insert into public.shop_brands(
    shop_id,brand_id,created_by,is_active,status,first_seen_at,last_seen_at
  ) values(
    p_shop_id,p_brand_id,auth.uid(),true,'available',p_observed_at,p_observed_at
  ) on conflict(shop_id,brand_id) do update set
    is_active=true,status='available',
    first_seen_at=least(public.shop_brands.first_seen_at,excluded.first_seen_at),
    last_seen_at=greatest(public.shop_brands.last_seen_at,excluded.last_seen_at)
  returning id into relation_id;
  insert into public.sightings(shop_brand_id,user_id,observed_at,comment)
  values(relation_id,auth.uid(),p_observed_at,nullif(trim(p_comment),''))
  returning id into result_id;
  return result_id;
end $$;

create function public.submit_brand_request(
  p_name text,p_brewery_name text,p_note text,p_shop_id uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare result_id uuid; recent_count integer;
begin
  if auth.uid() is null then
    raise exception '操作ユーザーを確認できません' using errcode='42501';
  end if;
  if length(trim(p_name))<1 or length(trim(p_name))>150 then
    raise exception '銘柄名を入力してください';
  end if;
  select count(*)::integer into recent_count from public.brand_requests
  where submitted_by=auth.uid() and created_at>now()-interval '1 hour';
  if recent_count>=10 then
    raise exception '短時間の報告回数が上限に達しました。時間をおいてお試しください';
  end if;
  insert into public.brand_requests(name,brewery_name,note,shop_id,submitted_by)
  values(
    trim(p_name),nullif(trim(p_brewery_name),''),nullif(trim(p_note),''),
    p_shop_id,auth.uid()
  ) returning id into result_id;
  return result_id;
end $$;

create function public.review_brand_request(p_id uuid,p_status text) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise insufficient_privilege; end if;
  if p_status not in ('resolved','dismissed') then
    raise exception '確認状態が不正です';
  end if;
  update public.brand_requests
  set status=p_status,reviewed_at=now(),reviewed_by=auth.uid()
  where id=p_id and status='pending';
  if not found then raise exception '未確認の報告が見つかりません'; end if;
  return p_id;
end $$;

create function public.update_display_name(p_name text) returns text
language plpgsql security definer set search_path='' as $$
declare normalized text;
begin
  if auth.uid() is null or public.is_anonymous_user() then
    raise exception 'アカウントを保存してから変更してください' using errcode='42501';
  end if;
  normalized=trim(p_name);
  if length(normalized)<1 or length(normalized)>30 then
    raise exception '表示名は1〜30文字で入力してください';
  end if;
  update public.users
  set name=normalized,name_is_custom=true,updated_at=now()
  where id=auth.uid();
  return normalized;
end $$;

create or replace function public.post_shop_comment(p_shop_id uuid,p_comment text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
  if auth.uid() is null or public.is_anonymous_user() then
    raise exception 'コメントにはログインが必要です' using errcode='42501';
  end if;
  if not exists(select 1 from public.shops where id=p_shop_id and is_active) then
    raise exception 'この酒屋にはコメントできません' using errcode='P0001';
  end if;
  insert into public.shop_comments(shop_id,user_id,comment)
  values(p_shop_id,auth.uid(),trim(p_comment)) returning id into result_id;
  return result_id;
end $$;

create or replace function public.search_shops(
  p_query text default '',p_brand_id uuid default null,
  p_south double precision default -90,p_north double precision default 90,
  p_west double precision default -180,p_east double precision default 180
) returns setof public.shops
language sql stable security invoker set search_path='' as $$
  select s.* from public.shops s
  where s.is_active
    and nullif(trim(s.name_kana),'') is not null
    and s.latitude is not null and s.longitude is not null
    and (
      (p_south=-90 and p_north=90 and p_west=-180 and p_east=180)
      or (
        (s.geocode_source is distinct from 'google' or s.geocoded_at>=now()-interval '30 days')
        and s.latitude between p_south and p_north
        and (case when p_west<=p_east
          then s.longitude between p_west and p_east
          else s.longitude>=p_west or s.longitude<=p_east end)
      )
    )
    and (
      p_query='' or position(lower(p_query) in lower(s.name))>0
      or position(lower(p_query) in lower(s.name_kana))>0
    )
    and (
      p_brand_id is null or exists(
        select 1 from public.shop_brands sb
        join public.brands b on b.id=sb.brand_id and b.is_active
        where sb.shop_id=s.id and sb.brand_id=p_brand_id
          and sb.status='available'
      )
    )
  order by s.name limit 200;
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
      'created_by','created_at','updated_at'
    ];
    perform public.save_master(
      h.entity_type,h.entity_id,payload,'履歴 '||h.id||' の状態に復元'
    );
  end if;
  perform set_config('saketan.restore','false',true);
end $$;

revoke execute on function public.is_anonymous_user(),public.assert_change_quota(integer),
  public.set_shop_brand_status(uuid,uuid,text,text),
  public.submit_brand_request(text,text,text,uuid),
  public.review_brand_request(uuid,text),public.update_display_name(text)
from public,anon,authenticated;
grant execute on function public.is_anonymous_user(),
  public.set_shop_brand_status(uuid,uuid,text,text),
  public.submit_brand_request(text,text,text,uuid),public.update_display_name(text)
to authenticated;
grant execute on function public.review_brand_request(uuid,text) to authenticated;
