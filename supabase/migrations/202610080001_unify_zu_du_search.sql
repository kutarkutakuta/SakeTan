-- Treat hiragana ず and づ as the same character while searching.
create or replace function public.normalize_kana_search(p_value text)
returns text
language sql immutable parallel safe set search_path='' as $$
  select replace(lower(coalesce(p_value, '')), 'づ', 'ず');
$$;

create or replace function public.search_brands(p_query text default '')
returns table(
  id uuid,name text,name_kana text,brewery_id uuid,brewery_name text,
  prefecture text,registration_status text,requested_brewery_name text,
  registered_at timestamptz
)
language sql stable security invoker set search_path='' as $$
with input as (
  select public.normalize_kana_search(trim(coalesce(p_query, ''))) as query
), candidates as (
  select
    b.id,b.name,b.name_kana,b.brewery_id,
    coalesce(w.name,b.requested_brewery_name) as brewery_name,
    w.name_kana as brewery_name_kana,w.prefecture,b.registration_status,
    b.requested_brewery_name,b.registered_at,input.query
  from public.brands b
  left join public.breweries w on w.id=b.brewery_id
  cross join input
  where b.is_active
    and b.registration_status in ('pending','approved')
    and (b.registration_status='pending' or w.id is not null)
    and (
      input.query=''
      or position(input.query in public.normalize_kana_search(b.name))>0
      or position(input.query in public.normalize_kana_search(coalesce(b.name_kana,'')))>0
      or position(input.query in public.normalize_kana_search(coalesce(w.name,'')))>0
      or position(input.query in public.normalize_kana_search(coalesce(w.name_kana,'')))>0
      or position(input.query in public.normalize_kana_search(coalesce(b.requested_brewery_name,'')))>0
    )
)
select
  c.id,c.name,c.name_kana,c.brewery_id,c.brewery_name,c.prefecture,
  c.registration_status,c.requested_brewery_name,c.registered_at
from candidates c
order by
  case
    when c.query='' then 9
    when public.normalize_kana_search(c.name)=c.query then 0
    when public.normalize_kana_search(coalesce(c.name_kana,''))=c.query then 1
    when position(c.query in public.normalize_kana_search(c.name))=1 then 2
    when position(c.query in public.normalize_kana_search(coalesce(c.name_kana,'')))=1 then 3
    when public.normalize_kana_search(coalesce(c.brewery_name,''))=c.query then 4
    when public.normalize_kana_search(coalesce(c.brewery_name_kana,''))=c.query then 5
    when position(c.query in public.normalize_kana_search(c.name))>0 then 6
    when position(c.query in public.normalize_kana_search(coalesce(c.name_kana,'')))>0 then 7
    when position(c.query in public.normalize_kana_search(coalesce(c.brewery_name,'')))>0 then 8
    else 9
  end,
  c.name;
$$;

create or replace function public.search_breweries(p_query text default '')
returns setof public.breweries
language sql stable security invoker set search_path='' as $$
with input as (
  select public.normalize_kana_search(trim(coalesce(p_query, ''))) as query
)
select b.*
from public.breweries b
cross join input
where b.is_active
  and (
    input.query=''
    or position(input.query in public.normalize_kana_search(b.name))>0
    or position(input.query in public.normalize_kana_search(coalesce(b.name_kana,'')))>0
  )
order by b.name
limit 40;
$$;

create or replace function public.search_shops(
  p_query text default '',p_brand_id uuid default null,
  p_south double precision default -90,p_north double precision default 90,
  p_west double precision default -180,p_east double precision default 180
) returns setof public.shops
language sql stable security invoker set search_path='' as $$
with input as (
  select public.normalize_kana_search(trim(coalesce(p_query, ''))) as query
)
select s.* from public.shops s
cross join input
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
    input.query=''
    or position(input.query in public.normalize_kana_search(s.name))>0
    or position(input.query in public.normalize_kana_search(s.name_kana))>0
  )
  and (
    p_brand_id is null or exists(
      select 1 from public.shop_brands sb
      join public.brands b on b.id=sb.brand_id and b.is_active
      where sb.shop_id=s.id and sb.brand_id=p_brand_id
        and sb.status='available'
    )
  )
order by s.name,s.id;
$$;

create or replace function public.search_shop_candidates(
  p_query text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_limit integer default 11,
  p_offset integer default 0
) returns setof public.shops
language sql stable security invoker set search_path='' as $$
with input as (
  select public.normalize_kana_search(trim(coalesce(p_query, ''))) as query
)
select s.*
from public.shops s
cross join input
where s.is_active
  and nullif(trim(s.name_kana),'') is not null
  and s.latitude is not null
  and s.longitude is not null
  and (
    input.query=''
    or position(input.query in public.normalize_kana_search(s.name))>0
    or position(input.query in public.normalize_kana_search(s.name_kana))>0
  )
order by
  case
    when p_latitude is not null and p_longitude is not null then
      sin(radians(p_latitude))*sin(radians(s.latitude))
      + cos(radians(p_latitude))*cos(radians(s.latitude))
        * cos(radians(s.longitude-p_longitude))
  end desc nulls last,
  s.name,
  s.id
limit least(greatest(p_limit,1),51)
offset least(greatest(p_offset,0),10000);
$$;
