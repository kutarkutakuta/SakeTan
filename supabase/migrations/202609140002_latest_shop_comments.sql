create function public.latest_shop_comments(p_shop_ids uuid[])
returns table(
  id uuid,
  shop_id uuid,
  comment text,
  commented_on date,
  user_name text
)
language sql stable security invoker set search_path='' as $$
  select distinct on (c.shop_id)
    c.id,
    c.shop_id,
    c.comment,
    c.commented_on,
    u.name as user_name
  from public.shop_comments c
  join public.users u on u.id=c.user_id
  where cardinality(p_shop_ids) between 1 and 50
    and c.shop_id=any(p_shop_ids)
    and not c.is_deleted
  order by c.shop_id,c.created_at desc,c.id desc;
$$;

revoke execute on function public.latest_shop_comments(uuid[])
from public,anon,authenticated;
grant execute on function public.latest_shop_comments(uuid[])
to anon,authenticated;
