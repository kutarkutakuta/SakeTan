create or replace function public.search_brands(p_query text default '')
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
  where b.is_active
    and b.registration_status in ('pending','approved')
    and (b.registration_status='pending' or w.id is not null)
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
$$;
