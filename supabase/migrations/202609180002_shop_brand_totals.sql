create function public.shop_brand_totals(p_shop_ids uuid[])
returns table(shop_id uuid,total bigint)
language sql stable security invoker set search_path='' as $$
  select requested.shop_id,count(b.id) as total
  from unnest(p_shop_ids) as requested(shop_id)
  left join public.shop_brands sb
    on sb.shop_id=requested.shop_id and sb.is_active
  left join public.brands b
    on b.id=sb.brand_id and b.is_active
  group by requested.shop_id;
$$;

revoke execute on function public.shop_brand_totals(uuid[])
from public,anon,authenticated;
grant execute on function public.shop_brand_totals(uuid[])
to anon,authenticated;
