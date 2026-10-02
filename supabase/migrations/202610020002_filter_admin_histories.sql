create function public.history_page(
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_shop_id uuid default null,
  p_include_admin boolean default false,
  p_offset integer default 0,
  p_limit integer default 30
) returns table(
  id uuid,
  entity_type text,
  entity_id uuid,
  action text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz,
  reason text,
  user_name text,
  total_count bigint
)
language sql stable security definer set search_path='' as $$
  select
    history.id,
    history.entity_type,
    history.entity_id,
    history.action,
    history.before_data,
    history.after_data,
    history.created_at,
    history.reason,
    editor.name as user_name,
    count(*) over() as total_count
  from public.change_histories history
  join public.users editor on editor.id=history.changed_by
  where
    (p_include_admin or editor.role<>'admin')
    and (
      (
        p_shop_id is not null
        and (
          (history.entity_type='shop' and history.entity_id=p_shop_id)
          or (
            history.entity_type='shop_brand'
            and coalesce(
              history.after_data->>'shop_id',
              history.before_data->>'shop_id'
            )=p_shop_id::text
          )
        )
      )
      or (
        p_shop_id is null
        and (p_entity_type is null or history.entity_type=p_entity_type)
        and (p_entity_id is null or history.entity_id=p_entity_id)
      )
    )
  order by history.created_at desc,history.id
  offset greatest(coalesce(p_offset,0),0)
  limit least(greatest(coalesce(p_limit,30),1),100)
$$;

revoke execute on function public.history_page(
  text,uuid,uuid,boolean,integer,integer
) from public,anon,authenticated;
grant execute on function public.history_page(
  text,uuid,uuid,boolean,integer,integer
) to anon,authenticated;
