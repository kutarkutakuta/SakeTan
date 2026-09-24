create or replace function public.search_brands(p_query text default '')
returns table(id uuid,name text,name_kana text,brewery_id uuid,brewery_name text,prefecture text)
language sql stable security invoker set search_path='' as $$
with candidates as (
  select
    b.id,
    b.name,
    b.name_kana,
    b.brewery_id,
    w.name as brewery_name,
    w.name_kana as brewery_name_kana,
    w.prefecture,
    lower(trim(coalesce(p_query, ''))) as query
  from public.brands b
  left join public.breweries w on w.id=b.brewery_id
  where b.is_active
    and (
      lower(trim(coalesce(p_query, ''))) = ''
      or position(lower(trim(coalesce(p_query, ''))) in lower(b.name)) > 0
      or position(lower(trim(coalesce(p_query, ''))) in lower(coalesce(b.name_kana, ''))) > 0
      or position(lower(trim(coalesce(p_query, ''))) in lower(coalesce(w.name, ''))) > 0
      or position(lower(trim(coalesce(p_query, ''))) in lower(coalesce(w.name_kana, ''))) > 0
    )
)
select c.id,c.name,c.name_kana,c.brewery_id,c.brewery_name,c.prefecture
from candidates c
order by
  case
    when c.query = '' then 9
    when lower(c.name) = c.query then 0
    when lower(coalesce(c.name_kana, '')) = c.query then 1
    when position(c.query in lower(c.name)) = 1 then 2
    when position(c.query in lower(coalesce(c.name_kana, ''))) = 1 then 3
    when lower(coalesce(c.brewery_name, '')) = c.query then 4
    when lower(coalesce(c.brewery_name_kana, '')) = c.query then 5
    when position(c.query in lower(c.name)) > 0 then 6
    when position(c.query in lower(coalesce(c.name_kana, ''))) > 0 then 7
    when position(c.query in lower(coalesce(c.brewery_name, ''))) > 0 then 8
    else 9
  end,
  case
    when c.query = '' then 0::double precision
    else greatest(
      case when position(c.query in lower(c.name)) > 0
        then length(c.query)::double precision / greatest(length(c.name), 1)
        else 0::double precision end,
      case when position(c.query in lower(coalesce(c.name_kana, ''))) > 0
        then length(c.query)::double precision / greatest(length(c.name_kana), 1)
        else 0::double precision end,
      case when position(c.query in lower(coalesce(c.brewery_name, ''))) > 0
        then length(c.query)::double precision / greatest(length(c.brewery_name), 1)
        else 0::double precision end,
      case when position(c.query in lower(coalesce(c.brewery_name_kana, ''))) > 0
        then length(c.query)::double precision / greatest(length(c.brewery_name_kana), 1)
        else 0::double precision end
    )
  end desc,
  c.name;
$$;

revoke execute on function public.search_brands(text) from public,anon,authenticated;
grant execute on function public.search_brands(text) to anon,authenticated;
