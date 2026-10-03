-- Fetch one extra match so the UI can distinguish 200 from 201+ shops.
-- The browser API returns only the first 200 shops and an overflow flag.
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
  order by s.name,s.id limit 201;
$$;
