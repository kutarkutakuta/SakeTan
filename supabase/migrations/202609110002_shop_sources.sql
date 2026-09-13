alter table public.shops
  add column source text,
  add column source_id text,
  add column source_url text;

alter table public.shops
  alter column latitude drop not null,
  alter column longitude drop not null,
  alter column city drop not null,
  add constraint shops_source_pair check ((source is null) = (source_id is null)),
  add constraint shops_source_unique unique (source, source_id),
  add constraint shops_source_url_http check (source_url is null or source_url ~ '^https?://');

create or replace function public.search_shops(
  p_query text default '',
  p_brand_id uuid default null,
  p_south double precision default -90,
  p_north double precision default 90,
  p_west double precision default -180,
  p_east double precision default 180
) returns setof public.shops
language sql stable security invoker set search_path='' as $$
  select s.*
  from public.shops s
  where s.is_active
    and (
      (p_south = -90 and p_north = 90 and p_west = -180 and p_east = 180)
      or (
        s.latitude is not null
        and s.longitude is not null
        and s.latitude between p_south and p_north
        and (
          case when p_west <= p_east
            then s.longitude between p_west and p_east
            else s.longitude >= p_west or s.longitude <= p_east
          end
        )
      )
    )
    and (
      p_query = ''
      or position(lower(p_query) in lower(s.name)) > 0
      or position(lower(p_query) in lower(coalesce(s.name_kana, ''))) > 0
      or position(lower(p_query) in lower(s.address)) > 0
    )
    and (
      p_brand_id is null
      or exists (
        select 1
        from public.shop_brands sb
        join public.brands b on b.id = sb.brand_id and b.is_active
        where sb.shop_id = s.id
          and sb.brand_id = p_brand_id
          and sb.is_active
      )
    )
  order by
    (s.latitude is not null and s.longitude is not null) desc,
    s.name
  limit 200;
$$;

revoke execute on function public.search_shops(text, uuid, double precision, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.search_shops(text, uuid, double precision, double precision, double precision, double precision) to anon, authenticated;
