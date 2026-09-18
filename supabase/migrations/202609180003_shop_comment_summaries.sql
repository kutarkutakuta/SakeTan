drop function public.latest_shop_comments(uuid[]);

create function public.latest_shop_comments(p_shop_ids uuid[])
returns table(
  id uuid,
  shop_id uuid,
  comment text,
  commented_on date,
  user_name text,
  comment_count bigint
)
language sql stable security invoker set search_path='' as $$
  with ranked as (
    select
      c.id,
      c.shop_id,
      c.comment,
      c.commented_on,
      u.name as user_name,
      count(*) over(partition by c.shop_id) as comment_count,
      row_number() over(
        partition by c.shop_id
        order by c.created_at desc,c.id desc
      ) as comment_position
    from public.shop_comments c
    join public.users u on u.id=c.user_id
    where cardinality(p_shop_ids) between 1 and 50
      and c.shop_id=any(p_shop_ids)
      and not c.is_deleted
  )
  select id,shop_id,comment,commented_on,user_name,comment_count
  from ranked
  where comment_position=1
  order by shop_id;
$$;

revoke execute on function public.latest_shop_comments(uuid[])
from public,anon,authenticated;
grant execute on function public.latest_shop_comments(uuid[])
to anon,authenticated;
