alter table public.shops
  add column geocode_source text,
  add column geocode_precision text,
  add column geocoded_at timestamptz,
  add constraint shops_geocode_metadata check (
    (
      geocode_source is null
      and geocode_precision is null
      and geocoded_at is null
    )
    or (
      geocode_source = 'google'
      and geocode_precision in (
        'ROOFTOP',
        'RANGE_INTERPOLATED',
        'GEOMETRIC_CENTER',
        'APPROXIMATE',
        'USER_ADJUSTED'
      )
      and geocoded_at is not null
      and latitude is not null
      and longitude is not null
    )
  );

create index shops_google_geocoded_at_idx
  on public.shops(geocoded_at)
  where geocode_source = 'google';

create or replace function public.search_shops(
  p_query text default '',
  p_brand_id uuid default null,
  p_south double precision default -90,
  p_north double precision default 90,
  p_west double precision default -180,
  p_east double precision default 180
) returns setof public.shops
language sql stable security invoker set search_path='' as $$
  select s.*
  from public.shops s
  where s.is_active
    and (
      (p_south = -90 and p_north = 90 and p_west = -180 and p_east = 180)
      or (
        s.latitude is not null
        and s.longitude is not null
        and (
          s.geocode_source is distinct from 'google'
          or s.geocoded_at >= now() - interval '30 days'
        )
        and s.latitude between p_south and p_north
        and (
          case when p_west <= p_east
            then s.longitude between p_west and p_east
            else s.longitude >= p_west or s.longitude <= p_east
          end
        )
      )
    )
    and (
      p_query = ''
      or position(lower(p_query) in lower(s.name)) > 0
      or position(lower(p_query) in lower(coalesce(s.name_kana, ''))) > 0
      or position(lower(p_query) in lower(s.address)) > 0
    )
    and (
      p_brand_id is null
      or exists (
        select 1
        from public.shop_brands sb
        join public.brands b on b.id = sb.brand_id and b.is_active
        where sb.shop_id = s.id
          and sb.brand_id = p_brand_id
          and sb.is_active
      )
    )
  order by
    (
      s.latitude is not null
      and s.longitude is not null
      and (
        s.geocode_source is distinct from 'google'
        or s.geocoded_at >= now() - interval '30 days'
      )
    ) desc,
    s.name
  limit 200;
$$;

create or replace function public.save_master(
  p_type text,
  p_id uuid,
  p_data jsonb,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare tab text; allowed text[]; field text; columns_sql text=''; values_sql text=''; updates_sql text=''; result_id uuid; previous jsonb;
begin
 if auth.uid() is null then raise exception 'ログインしてください' using errcode='42501'; end if;
 case p_type
 when 'brewery' then tab='breweries'; allowed=array['name','name_kana','prefecture','website_url','is_active'];
 when 'brand' then tab='brands'; allowed=array['name','name_kana','brewery_id','is_active'];
 when 'shop' then
  tab='shops';
  allowed=array[
    'name','name_kana','prefecture','city','address','latitude','longitude',
    'website_url','is_active','geocode_source','geocode_precision','geocoded_at'
  ];
  if p_data->>'geocode_source' = 'google' then
    p_data = p_data || jsonb_build_object('geocoded_at', now());
  end if;
 else raise exception '編集対象が不正です'; end case;
 if jsonb_typeof(p_data)<>'object' or p_data='{}'::jsonb then raise exception '入力が空です'; end if;
 for field in select jsonb_object_keys(p_data) loop
  if not field=any(allowed) then raise exception '変更できない項目です: %',field; end if;
  if field='geocoded_at' and p_data->>'geocoded_at' is not null and p_data->>'geocode_source' is distinct from 'google' then
    raise exception '位置情報の取得日時は直接変更できません';
  end if;
  columns_sql=columns_sql||format('%I,',field); values_sql=values_sql||format('r.%I,',field); updates_sql=updates_sql||format('%I=r.%I,',field,field);
 end loop;
 perform set_config('saketan.reason',coalesce(p_reason,''),true);
 if p_id is null then
  execute format('insert into public.%I(%screated_by) select %s$2 from jsonb_populate_record(null::public.%I,$1) r returning id',tab,columns_sql,values_sql,tab) using p_data,auth.uid() into result_id;
 else
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',tab) using p_id into previous;
  if previous is null then raise exception '対象が見つかりません'; end if;
  execute format('update public.%I t set %supdated_at=now() from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning t.id',tab,updates_sql,tab) using p_data,p_id into result_id;
 end if;
 return result_id;
end $$;
