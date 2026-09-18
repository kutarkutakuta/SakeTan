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
  sakenowa_rank_year_month text
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
      row_number() over(
        partition by sb.shop_id
        order by
          b.sakenowa_rank asc nulls last,
          sb.last_seen_at desc nulls last,
          b.id
      ) as position
    from public.shop_brands sb
    join public.brands b on b.id=sb.brand_id and b.is_active
    where sb.shop_id=any(p_shop_ids) and sb.is_active
  )
  select
    ranked.shop_id,
    ranked.total,
    ranked.brand_id,
    ranked.brand_name,
    ranked.brand_name_kana,
    ranked.brewery_id,
    ranked.sakenowa_rank,
    ranked.sakenowa_score,
    ranked.sakenowa_rank_year_month
  from ranked
  where ranked.position<=least(greatest(p_limit,1),20)
  order by ranked.shop_id,ranked.position;
$$;

revoke execute on function public.shop_brand_previews(uuid[],integer)
from public,anon,authenticated;
grant execute on function public.shop_brand_previews(uuid[],integer)
to anon,authenticated;
