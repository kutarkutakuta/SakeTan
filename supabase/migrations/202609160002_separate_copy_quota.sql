create or replace function public.assert_change_quota(p_max integer) returns void
language plpgsql security definer set search_path='' as $$
declare recent_count integer;
begin
  if auth.uid() is null then
    raise exception '操作ユーザーを確認できません' using errcode='42501';
  end if;
  select count(*)::integer into recent_count
  from public.change_histories
  where changed_by=auth.uid()
    and created_at>now()-interval '1 hour'
    and coalesce(reason,'') not like '取扱銘柄一括コピー:%';
  if recent_count>=p_max then
    raise exception '短時間の変更回数が上限に達しました。時間をおいてお試しください'
      using errcode='P0001';
  end if;
end $$;

create or replace function public.copy_shop_brands(
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
  recent_copy_count integer;
  copied_count integer;
begin
  preview=public.preview_shop_brand_copy(p_source_shop_id,p_target_shop_ids);
  source_name=preview->>'source_name';
  source_count=(preview->>'source_count')::integer;
  target_count=(preview->>'target_count')::integer;
  add_count=(preview->>'add_count')::integer;

  if source_count=0 then raise exception 'コピーできる取扱銘柄がありません'; end if;
  if add_count>5000 then
    raise exception '1回にコピーできる取扱情報は5000件までです。コピー先を減らしてください'
      using errcode='P0001';
  end if;

  select coalesce(array_agg(distinct value), '{}'::uuid[])
  into target_ids
  from unnest(coalesce(p_target_shop_ids, '{}'::uuid[])) as selected(value)
  where value<>p_source_shop_id;

  select count(*)::integer into recent_copy_count
  from public.change_histories
  where changed_by=auth.uid()
    and created_at>now()-interval '1 hour'
    and reason like '取扱銘柄一括コピー:%';
  if recent_copy_count+add_count>10000 then
    raise exception '1時間にコピーできる取扱情報は10000件までです。時間をおいてお試しください'
      using errcode='P0001';
  end if;

  perform set_config(
    'saketan.reason',
    '取扱銘柄一括コピー: '||source_name||'からコピー',
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

revoke execute on function public.assert_change_quota(integer),
  public.copy_shop_brands(uuid,uuid[])
from public,anon,authenticated;
grant execute on function public.assert_change_quota(integer),
  public.copy_shop_brands(uuid,uuid[])
to authenticated;
