create extension if not exists pgcrypto;

create table public.users (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null, email text not null, image_url text,
 role text not null default 'user' check (role in ('user','admin')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.breweries (
 id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 1 and 150),
 name_kana text, prefecture text, website_url text check (website_url is null or website_url ~ '^https?://'),
 source text, source_id text, created_by uuid references public.users(id), is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(source,source_id), check ((source is null) = (source_id is null))
);
create table public.brands (
 id uuid primary key default gen_random_uuid(), brewery_id uuid references public.breweries(id),
 name text not null check (length(trim(name)) between 1 and 150), name_kana text,
 source text, source_id text, external_url text check (external_url is null or external_url ~ '^https://sakenowa\.com/brand/[^/?#]+'),
 created_by uuid references public.users(id), is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(source,source_id), check ((source is null) = (source_id is null))
);
create table public.shops (
 id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 1 and 150), name_kana text,
 prefecture text not null check(length(trim(prefecture)) > 0), city text not null check(length(trim(city)) > 0), address text not null check(length(trim(address)) > 0),
 latitude double precision not null check(latitude between -90 and 90), longitude double precision not null check(longitude between -180 and 180),
 website_url text check (website_url is null or website_url ~ '^https?://'), created_by uuid references public.users(id), is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.shop_brands (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id), brand_id uuid not null references public.brands(id),
 created_by uuid references public.users(id), is_active boolean not null default true,
 first_seen_at date, last_seen_at date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(shop_id,brand_id), check(first_seen_at <= last_seen_at)
);
create table public.sightings (
 id uuid primary key default gen_random_uuid(), shop_brand_id uuid not null references public.shop_brands(id), user_id uuid not null references public.users(id),
 comment text check(length(comment) <= 1000), observed_at date not null, is_deleted boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.change_histories (
 id uuid primary key default gen_random_uuid(), entity_type text not null check(entity_type in ('brewery','brand','shop','shop_brand')),
 entity_id uuid not null, action text not null check(action in ('create','update','deactivate','restore')),
 before_data jsonb, after_data jsonb, changed_by uuid not null references public.users(id), reason text,
 created_at timestamptz not null default now()
);
create index on public.shop_brands(brand_id,shop_id) where is_active;
create index on public.shops(latitude,longitude) where is_active;
create index on public.sightings(shop_brand_id,observed_at desc) where not is_deleted;
create index on public.change_histories(entity_type,entity_id,created_at desc);
create index on public.brands(brewery_id);

create function public.sync_auth_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.users(id,name,email,image_url) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','日本酒さん'),coalesce(new.email,''),new.raw_user_meta_data->>'avatar_url')
 on conflict(id) do update set name=excluded.name,email=excluded.email,image_url=excluded.image_url,updated_at=now();
 return new;
end $$;
create trigger sync_auth_user after insert or update of email,raw_user_meta_data on auth.users for each row execute function public.sync_auth_user();
insert into public.users(id,name,email,image_url) select id,coalesce(raw_user_meta_data->>'full_name','日本酒さん'),coalesce(email,''),raw_user_meta_data->>'avatar_url' from auth.users on conflict(id) do nothing;

create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users where id=auth.uid() and role='admin');
$$;
create function public.audit_master() returns trigger language plpgsql security definer set search_path='' as $$
declare previous jsonb; current_data jsonb; verb text; kind text;
begin
 new.updated_at=now();
 if auth.uid() is null then return new; end if;
 current_data=to_jsonb(new); previous=case when tg_op='UPDATE' then to_jsonb(old) else null end;
 if previous is not null and (previous-'updated_at')=(current_data-'updated_at') and coalesce(current_setting('saketan.restore',true),'')<>'true' then return new; end if;
 kind=case tg_table_name when 'breweries' then 'brewery' when 'brands' then 'brand' when 'shops' then 'shop' else 'shop_brand' end;
 verb=case when current_setting('saketan.restore',true)='true' then 'restore' when tg_op='INSERT' then 'create' when old.is_active and not new.is_active then 'deactivate' else 'update' end;
 insert into public.change_histories(entity_type,entity_id,action,before_data,after_data,changed_by,reason)
 values(kind,new.id,verb,previous,current_data,auth.uid(),nullif(current_setting('saketan.reason',true),''));
 return new;
end $$;
create trigger audit_breweries before insert or update on public.breweries for each row execute function public.audit_master();
create trigger audit_brands before insert or update on public.brands for each row execute function public.audit_master();
create trigger audit_shops before insert or update on public.shops for each row execute function public.audit_master();
create trigger audit_shop_brands before insert or update on public.shop_brands for each row execute function public.audit_master();

alter table public.users enable row level security;
alter table public.breweries enable row level security;
alter table public.brands enable row level security;
alter table public.shops enable row level security;
alter table public.shop_brands enable row level security;
alter table public.sightings enable row level security;
alter table public.change_histories enable row level security;
create policy read_users on public.users for select using(true);
create policy read_breweries on public.breweries for select using(true);
create policy read_brands on public.brands for select using(true);
create policy read_shops on public.shops for select using(true);
create policy read_shop_brands on public.shop_brands for select using(true);
create policy read_sightings on public.sightings for select using(not is_deleted or user_id=auth.uid() or public.is_admin());
create policy read_histories on public.change_histories for select using(true);
revoke all on public.users,public.breweries,public.brands,public.shops,public.shop_brands,public.sightings,public.change_histories from anon,authenticated;
grant select(id,name,image_url) on public.users to anon,authenticated;
grant select on public.breweries,public.brands,public.shops,public.shop_brands,public.sightings,public.change_histories to anon,authenticated;

create function public.post_sighting(p_shop_id uuid,p_brand_id uuid,p_observed_at date,p_comment text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare relation_id uuid; result_id uuid;
begin
 if auth.uid() is null then raise exception 'ログインしてください' using errcode='42501'; end if;
 if p_observed_at is null or p_observed_at > (now() at time zone 'Asia/Tokyo')::date then raise exception '見つけた日を確認してください'; end if;
 perform 1 from public.shops where id=p_shop_id and is_active for share;
 if not found then raise exception '酒屋が見つかりません'; end if;
 perform 1 from public.brands where id=p_brand_id and is_active for share;
 if not found then raise exception '銘柄が見つかりません'; end if;
 insert into public.shop_brands(shop_id,brand_id,created_by,first_seen_at,last_seen_at)
 values(p_shop_id,p_brand_id,auth.uid(),p_observed_at,p_observed_at)
 on conflict(shop_id,brand_id) do update set is_active=true,
 first_seen_at=least(public.shop_brands.first_seen_at,excluded.first_seen_at),last_seen_at=greatest(public.shop_brands.last_seen_at,excluded.last_seen_at)
 returning id into relation_id;
 insert into public.sightings(shop_brand_id,user_id,observed_at,comment) values(relation_id,auth.uid(),p_observed_at,nullif(trim(p_comment),'')) returning id into result_id;
 return result_id;
end $$;

create function public.edit_sighting(p_id uuid,p_observed_at date,p_comment text,p_delete boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare s public.sightings; relation_id uuid;
begin
 if auth.uid() is null then raise exception 'ログインしてください' using errcode='42501'; end if;
 select shop_brand_id into relation_id from public.sightings where id=p_id;
 perform 1 from public.shop_brands where id=relation_id for update;
 select * into s from public.sightings where id=p_id for update;
 if s.id is null or (s.user_id<>auth.uid() and not public.is_admin()) then raise exception 'この投稿を変更できません' using errcode='42501'; end if;
 if p_observed_at is null or p_observed_at > (now() at time zone 'Asia/Tokyo')::date then raise exception '見つけた日を確認してください'; end if;
 update public.sightings set comment=nullif(trim(p_comment),''),observed_at=p_observed_at,is_deleted=p_delete,updated_at=now() where id=p_id;
 update public.shop_brands set first_seen_at=(select min(observed_at) from public.sightings where shop_brand_id=s.shop_brand_id and not is_deleted),
 last_seen_at=(select max(observed_at) from public.sightings where shop_brand_id=s.shop_brand_id and not is_deleted) where id=s.shop_brand_id;
end $$;

create function public.save_master(p_type text,p_id uuid,p_data jsonb,p_reason text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare tab text; allowed text[]; field text; columns_sql text=''; values_sql text=''; updates_sql text=''; result_id uuid; previous jsonb;
begin
 if auth.uid() is null then raise exception 'ログインしてください' using errcode='42501'; end if;
 case p_type
 when 'brewery' then tab='breweries'; allowed=array['name','name_kana','prefecture','website_url','is_active'];
 when 'brand' then tab='brands'; allowed=array['name','name_kana','brewery_id','is_active'];
 when 'shop' then tab='shops'; allowed=array['name','name_kana','prefecture','city','address','latitude','longitude','website_url','is_active'];
 else raise exception '編集対象が不正です'; end case;
 if jsonb_typeof(p_data)<>'object' or p_data='{}'::jsonb then raise exception '入力が空です'; end if;
 for field in select jsonb_object_keys(p_data) loop
  if not field=any(allowed) then raise exception '変更できない項目です: %',field; end if;
  columns_sql=columns_sql||format('%I,',field); values_sql=values_sql||format('r.%I,',field); updates_sql=updates_sql||format('%I=r.%I,',field,field);
 end loop;
 perform set_config('saketan.reason',coalesce(p_reason,''),true);
 if p_id is null then
  execute format('insert into public.%I(%screated_by) select %s$2 from jsonb_populate_record(null::public.%I,$1) r returning id',tab,columns_sql,values_sql,tab) using p_data,auth.uid() into result_id;
 else
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) using p_id into previous;
  if previous is null then raise exception '対象が見つかりません'; end if;
  execute format('update public.%I t set %supdated_at=now() from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning t.id',tab,updates_sql,tab) using p_data,p_id into result_id;
 end if;
 return result_id;
end $$;

create function public.restore_history(p_history_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare h public.change_histories; payload jsonb; target public.shop_brands;
begin
 if not public.is_admin() then raise exception '管理者のみ復元できます' using errcode='42501'; end if;
 select * into h from public.change_histories where id=p_history_id;
 if h.id is null or h.after_data is null then raise exception '履歴が見つかりません'; end if;
 perform set_config('saketan.restore','true',true);
 if h.entity_type='shop_brand' then
  select * into target from public.shop_brands where id=h.entity_id for update;
  update public.shop_brands set is_active=(h.after_data->>'is_active')::boolean,
   first_seen_at=(select min(observed_at) from public.sightings where shop_brand_id=target.id and not is_deleted),
   last_seen_at=(select max(observed_at) from public.sightings where shop_brand_id=target.id and not is_deleted) where id=target.id;
 else
  payload=h.after_data - array['id','source','source_id','external_url','created_by','created_at','updated_at'];
  perform public.save_master(h.entity_type,h.entity_id,payload,'履歴 '||h.id||' の状態に復元');
 end if;
 perform set_config('saketan.restore','false',true);
end $$;

create function public.search_brands(p_query text default '') returns table(id uuid,name text,name_kana text,brewery_id uuid,brewery_name text,prefecture text)
language sql stable security invoker set search_path='' as $$
 select b.id,b.name,b.name_kana,b.brewery_id,w.name,w.prefecture from public.brands b left join public.breweries w on w.id=b.brewery_id
 where b.is_active and (p_query='' or position(lower(p_query) in lower(b.name))>0 or position(lower(p_query) in lower(coalesce(b.name_kana,'')))>0 or position(lower(p_query) in lower(coalesce(w.name,'')))>0 or position(lower(p_query) in lower(coalesce(w.name_kana,'')))>0)
 order by b.name limit 40;
$$;
create function public.search_shops(p_query text default '',p_brand_id uuid default null,p_south double precision default -90,p_north double precision default 90,p_west double precision default -180,p_east double precision default 180)
returns setof public.shops language sql stable security invoker set search_path='' as $$
 select s.* from public.shops s where s.is_active and s.latitude between p_south and p_north
 and (case when p_west<=p_east then s.longitude between p_west and p_east else s.longitude>=p_west or s.longitude<=p_east end)
 and (p_query='' or position(lower(p_query) in lower(s.name))>0 or position(lower(p_query) in lower(coalesce(s.name_kana,'')))>0)
 and (p_brand_id is null or exists(select 1 from public.shop_brands sb join public.brands b on b.id=sb.brand_id and b.is_active where sb.shop_id=s.id and sb.brand_id=p_brand_id and sb.is_active))
 order by s.name limit 200;
$$;
create function public.search_breweries(p_query text default '') returns setof public.breweries language sql stable security invoker set search_path='' as $$
 select * from public.breweries where is_active and (p_query='' or position(lower(p_query) in lower(name))>0 or position(lower(p_query) in lower(coalesce(name_kana,'')))>0) order by name limit 40;
$$;
revoke execute on function public.sync_auth_user(),public.audit_master(),public.is_admin(),public.search_brands(text),public.search_breweries(text),public.search_shops(text,uuid,double precision,double precision,double precision,double precision),public.post_sighting(uuid,uuid,date,text),public.edit_sighting(uuid,date,text,boolean),public.save_master(text,uuid,jsonb,text),public.restore_history(uuid) from public,anon,authenticated;
grant execute on function public.is_admin(),public.search_brands(text),public.search_shops(text,uuid,double precision,double precision,double precision,double precision) to anon,authenticated;
grant execute on function public.search_breweries(text) to anon,authenticated;
grant execute on function public.post_sighting(uuid,uuid,date,text),public.edit_sighting(uuid,date,text,boolean),public.save_master(text,uuid,jsonb,text),public.restore_history(uuid) to authenticated;

create function public.immutable_history() returns trigger language plpgsql set search_path='' as $$
begin raise exception '履歴は編集・削除できません' using errcode='42501'; end $$;
create trigger immutable_history before update or delete on public.change_histories for each row execute function public.immutable_history();
create trigger immutable_history_truncate before truncate on public.change_histories for each statement execute function public.immutable_history();
revoke execute on function public.immutable_history() from public,anon,authenticated;
grant all on public.users,public.breweries,public.brands,public.shops,public.shop_brands,public.sightings,public.change_histories to service_role;
revoke insert,update,delete,truncate on public.change_histories from service_role;
