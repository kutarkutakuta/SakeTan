create function public.preview_shop_brand_copy(
  p_source_shop_id uuid,
  p_target_shop_ids uuid[]
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  source_name text;
  target_ids uuid[];
  source_count integer;
  target_count integer;
  target_summaries jsonb;
  add_count integer;
begin
  if auth.uid() is null or public.is_anonymous_user() then
    raise exception 'ログインしてください' using errcode='42501';
  end if;

  select coalesce(array_agg(distinct value), '{}'::uuid[])
  into target_ids
  from unnest(coalesce(p_target_shop_ids, '{}'::uuid[])) as selected(value)
  where value<>p_source_shop_id;

  if cardinality(target_ids)<1 or cardinality(target_ids)>10 then
    raise exception 'コピー先は1〜10店舗で選んでください';
  end if;

  select s.name into source_name
  from public.shops s
  where s.id=p_source_shop_id and s.is_active;
  if source_name is null then raise exception 'コピー元の酒屋が見つかりません'; end if;

  select count(*)::integer into target_count
  from public.shops s
  where s.id=any(target_ids) and s.is_active;
  if target_count<>cardinality(target_ids) then
    raise exception 'コピー先の酒屋を確認してください';
  end if;

  select count(*)::integer into source_count
  from public.shop_brands sb
  join public.brands b on b.id=sb.brand_id and b.is_active
  where sb.shop_id=p_source_shop_id
    and sb.status='available'
    and sb.is_active;

  select
    coalesce(sum(summary.add_count),0)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',summary.id,
          'name',summary.name,
          'prefecture',summary.prefecture,
          'city',summary.city,
          'add_count',summary.add_count,
          'skip_count',source_count-summary.add_count
        ) order by summary.name
      ),
      '[]'::jsonb
    )
  into add_count,target_summaries
  from (
    select
      s.id,
      s.name,
      s.prefecture,
      s.city,
      count(*) filter(where existing.id is null)::integer as add_count
    from public.shops s
    cross join public.shop_brands source_relation
    join public.brands b
      on b.id=source_relation.brand_id and b.is_active
    left join public.shop_brands existing
      on existing.shop_id=s.id
      and existing.brand_id=source_relation.brand_id
    where s.id=any(target_ids)
      and source_relation.shop_id=p_source_shop_id
      and source_relation.status='available'
      and source_relation.is_active
    group by s.id,s.name,s.prefecture,s.city
  ) summary;

  if source_count=0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',s.id,
          'name',s.name,
          'prefecture',s.prefecture,
          'city',s.city,
          'add_count',0,
          'skip_count',0
        ) order by s.name
      ),
      '[]'::jsonb
    ) into target_summaries
    from public.shops s
    where s.id=any(target_ids);
  end if;

  return jsonb_build_object(
    'source_name',source_name,
    'source_count',source_count,
    'target_count',target_count,
    'add_count',coalesce(add_count,0),
    'skip_count',source_count*target_count-coalesce(add_count,0),
    'targets',target_summaries
  );
end $$;

create function public.copy_shop_brands(
  p_source_shop_id uuid,
  p_target_shop_ids uuid[]
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  preview jsonb;
  source_name text;
  target_ids uuid[];
  source_count integer;
  target_count integer;
  add_count integer;
  recent_count integer;
  copied_count integer;
begin
  preview=public.preview_shop_brand_copy(p_source_shop_id,p_target_shop_ids);
  source_name=preview->>'source_name';
  source_count=(preview->>'source_count')::integer;
  target_count=(preview->>'target_count')::integer;
  add_count=(preview->>'add_count')::integer;

  if source_count=0 then raise exception 'コピーできる取扱銘柄がありません'; end if;

  select coalesce(array_agg(distinct value), '{}'::uuid[])
  into target_ids
  from unnest(coalesce(p_target_shop_ids, '{}'::uuid[])) as selected(value)
  where value<>p_source_shop_id;

  select count(*)::integer into recent_count
  from public.change_histories
  where changed_by=auth.uid() and created_at>now()-interval '1 hour';
  if recent_count+add_count>240 then
    raise exception 'コピーすると短時間の変更回数が上限を超えます。コピー先を減らしてください'
      using errcode='P0001';
  end if;

  perform set_config(
    'saketan.reason',
    source_name||'から取扱銘柄をコピー',
    true
  );
  insert into public.shop_brands(
    shop_id,brand_id,created_by,is_active,status
  )
  select
    target.id,source_relation.brand_id,auth.uid(),true,'available'
  from unnest(target_ids) as target(id)
  cross join public.shop_brands source_relation
  join public.brands b
    on b.id=source_relation.brand_id and b.is_active
  where source_relation.shop_id=p_source_shop_id
    and source_relation.status='available'
    and source_relation.is_active
    and not exists(
      select 1
      from public.shop_brands existing
      where existing.shop_id=target.id
        and existing.brand_id=source_relation.brand_id
    )
  on conflict(shop_id,brand_id) do nothing;
  get diagnostics copied_count=row_count;

  return preview||jsonb_build_object(
    'copied_count',copied_count,
    'skip_count',source_count*target_count-copied_count
  );
end $$;

revoke execute on function public.preview_shop_brand_copy(uuid,uuid[]),
  public.copy_shop_brands(uuid,uuid[])
from public,anon,authenticated;
grant execute on function public.preview_shop_brand_copy(uuid,uuid[]),
  public.copy_shop_brands(uuid,uuid[])
to authenticated;
