create function public.search_shop_candidates(
  p_query text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_limit integer default 11,
  p_offset integer default 0
) returns setof public.shops
language sql stable security invoker set search_path='' as $$
  select s.*
  from public.shops s
  where s.is_active
    and nullif(trim(s.name_kana),'') is not null
    and s.latitude is not null
    and s.longitude is not null
    and (
      trim(p_query)=''
      or position(lower(trim(p_query)) in lower(s.name))>0
      or position(lower(trim(p_query)) in lower(s.name_kana))>0
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

revoke execute on function public.search_shop_candidates(
  text,double precision,double precision,integer,integer
) from public,anon,authenticated;

grant execute on function public.search_shop_candidates(
  text,double precision,double precision,integer,integer
) to anon,authenticated;
