-- Administrators can create local brewery and brand masters from the edit page.
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
  if p_type in ('brand','brewery') and not public.is_admin() then
    raise exception '銘柄と酒蔵は管理者だけ編集できます' using errcode='42501';
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
