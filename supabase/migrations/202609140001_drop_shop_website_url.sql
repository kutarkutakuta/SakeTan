alter table public.change_histories disable trigger immutable_history;

update public.change_histories
set
  before_data=case
    when before_data is null then null
    else before_data-'website_url'
  end,
  after_data=case
    when after_data is null then null
    else after_data-'website_url'
  end
where entity_type='shop'
  and (
    before_data ? 'website_url'
    or after_data ? 'website_url'
  );

alter table public.change_histories enable trigger immutable_history;

alter table public.shops drop column website_url;

create or replace function public.save_master(
  p_type text,
  p_id uuid,
  p_data jsonb,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  tab text; allowed text[]; field text; columns_sql text='';
  values_sql text=''; updates_sql text=''; result_id uuid; previous jsonb;
begin
  if auth.uid() is null or public.is_anonymous_user() then
    raise exception 'ログインしてください' using errcode='42501';
  end if;
  if p_type in ('brand','brewery') then
    if p_id is null then
      raise exception '銘柄と酒蔵の登録は、さけのわ同期からのみ行えます'
        using errcode='42501';
    end if;
    if not public.is_admin() then
      raise exception '銘柄と酒蔵は管理者だけ編集できます'
        using errcode='42501';
    end if;
  end if;
  case p_type
    when 'brewery' then
      tab='breweries'; allowed=array['name','name_kana','prefecture','website_url','is_active'];
    when 'brand' then
      tab='brands'; allowed=array['name','name_kana','brewery_id','is_active'];
    when 'shop' then
      tab='shops';
      allowed=array[
        'name','name_kana','prefecture','city','latitude','longitude',
        'google_place_id','is_active','geocode_source','geocode_precision',
        'geocoded_at'
      ];
      if p_data->>'geocode_source'='google' then
        p_data=p_data||jsonb_build_object('geocoded_at',now());
      end if;
    else raise exception '編集対象が不正です';
  end case;
  if jsonb_typeof(p_data)<>'object' or p_data='{}'::jsonb then
    raise exception '入力が空です';
  end if;
  for field in select jsonb_object_keys(p_data) loop
    if not field=any(allowed) then
      raise exception '変更できない項目です: %',field;
    end if;
    if field='geocoded_at'
      and p_data->>'geocoded_at' is not null
      and p_data->>'geocode_source' is distinct from 'google'
    then raise exception '位置情報の取得日時は直接変更できません'; end if;
    columns_sql=columns_sql||format('%I,',field);
    values_sql=values_sql||format('r.%I,',field);
    updates_sql=updates_sql||format('%I=r.%I,',field,field);
  end loop;
  perform set_config('saketan.reason',coalesce(p_reason,''),true);
  if p_id is null then
    execute format(
      'insert into public.%I(%screated_by) select %s$2 from jsonb_populate_record(null::public.%I,$1) r returning id',
      tab,columns_sql,values_sql,tab
    ) using p_data,auth.uid() into result_id;
  else
    execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab)
      using p_id into previous;
    if previous is null then raise exception '対象が見つかりません'; end if;
    execute format(
      'update public.%I t set %supdated_at=now() from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning t.id',
      tab,updates_sql,tab
    ) using p_data,p_id into result_id;
  end if;
  return result_id;
end $$;

create or replace function public.restore_history(p_history_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare h public.change_histories; payload jsonb; target public.shop_brands; restored_status text;
begin
  if not public.is_admin() then
    raise exception '管理者のみ復元できます' using errcode='42501';
  end if;
  select * into h from public.change_histories where id=p_history_id;
  if h.id is null or h.after_data is null then raise exception '履歴が見つかりません'; end if;
  perform set_config('saketan.restore','true',true);
  if h.entity_type='shop_brand' then
    select * into target from public.shop_brands where id=h.entity_id for update;
    restored_status=coalesce(
      h.after_data->>'status',
      case when (h.after_data->>'is_active')::boolean then 'available' else 'incorrect' end
    );
    update public.shop_brands set
      status=restored_status,is_active=(restored_status='available'),
      first_seen_at=(select min(observed_at) from public.sightings where shop_brand_id=target.id and not is_deleted),
      last_seen_at=(select max(observed_at) from public.sightings where shop_brand_id=target.id and not is_deleted)
    where id=target.id;
  else
    payload=h.after_data-array[
      'id','source','source_id','source_url','external_url','address',
      'created_by','created_at','updated_at'
    ];
    if h.entity_type='shop' then payload=payload-'website_url'; end if;
    perform public.save_master(
      h.entity_type,h.entity_id,payload,'履歴 '||h.id||' の状態に復元'
    );
  end if;
  perform set_config('saketan.restore','false',true);
end $$;
