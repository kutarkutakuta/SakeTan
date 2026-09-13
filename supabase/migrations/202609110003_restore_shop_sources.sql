create or replace function public.restore_history(p_history_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare h public.change_histories; payload jsonb; target public.shop_brands;
begin
  if not public.is_admin() then
    raise exception '管理者のみ復元できます' using errcode='42501';
  end if;

  select * into h from public.change_histories where id=p_history_id;
  if h.id is null or h.after_data is null then
    raise exception '履歴が見つかりません';
  end if;

  perform set_config('saketan.restore','true',true);
  if h.entity_type='shop_brand' then
    select * into target from public.shop_brands where id=h.entity_id for update;
    update public.shop_brands
    set is_active=(h.after_data->>'is_active')::boolean,
        first_seen_at=(select min(observed_at) from public.sightings where shop_brand_id=target.id and not is_deleted),
        last_seen_at=(select max(observed_at) from public.sightings where shop_brand_id=target.id and not is_deleted)
    where id=target.id;
  else
    payload=h.after_data - array[
      'id', 'source', 'source_id', 'source_url', 'external_url',
      'created_by', 'created_at', 'updated_at'
    ];
    perform public.save_master(h.entity_type,h.entity_id,payload,'履歴 '||h.id||' の状態に復元');
  end if;
  perform set_config('saketan.restore','false',true);
end $$;

revoke execute on function public.restore_history(uuid) from public, anon, authenticated;
grant execute on function public.restore_history(uuid) to authenticated;
