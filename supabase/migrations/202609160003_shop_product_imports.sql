create table public.shop_product_imports (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  source_url text not null check (source_url ~ '^https?://'),
  fetched_at timestamptz not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  item_count integer not null check (item_count between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.shop_product_import_items (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.shop_product_imports(id),
  brand_id uuid not null references public.brands(id),
  source_name text not null check (length(trim(source_name)) between 1 and 300),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  created_at timestamptz not null default now(),
  unique(import_id, brand_id, source_name)
);

create index shop_product_imports_shop_created_idx
  on public.shop_product_imports(shop_id,created_at desc);
create index shop_product_import_items_brand_idx
  on public.shop_product_import_items(brand_id);

alter table public.shop_product_imports enable row level security;
alter table public.shop_product_import_items enable row level security;

revoke all on public.shop_product_imports,public.shop_product_import_items
  from anon,authenticated;
grant select,insert on public.shop_product_imports,public.shop_product_import_items
  to service_role;

create function public.import_shop_products(
  p_shop_id uuid,
  p_source_url text,
  p_fetched_at timestamptz,
  p_content_sha256 text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  result_id uuid;
  item_total integer;
  added_total integer;
  reactivated_total integer;
begin
  if p_source_url is null or p_source_url !~ '^https?://' then
    raise exception '取得元URLが不正です';
  end if;
  if p_fetched_at is null then
    raise exception '取得日時が必要です';
  end if;
  if p_content_sha256 is null or p_content_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'コンテンツハッシュが不正です';
  end if;
  if jsonb_typeof(p_items)<>'array' then
    raise exception '取扱銘柄が配列ではありません';
  end if;

  item_total=jsonb_array_length(p_items);
  if item_total<1 or item_total>500 then
    raise exception '一度に登録できる取扱銘柄は1〜500件です';
  end if;

  perform 1 from public.shops
  where id=p_shop_id and is_active
  for share;
  if not found then raise exception '酒屋が見つかりません'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as item(brand_id uuid,source_name text,source_url text)
    where item.brand_id is null
      or length(trim(coalesce(item.source_name,''))) not between 1 and 300
      or (item.source_url is not null and item.source_url !~ '^https?://')
  ) then
    raise exception '取扱銘柄の入力内容が不正です';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as item(brand_id uuid,source_name text,source_url text)
    left join public.brands brand
      on brand.id=item.brand_id and brand.is_active
    where brand.id is null
  ) then
    raise exception '有効な銘柄マスターに存在しない項目があります';
  end if;

  with approved as (
    select distinct item.brand_id
    from jsonb_to_recordset(p_items)
      as item(brand_id uuid,source_name text,source_url text)
  )
  select
    count(*) filter (where relation.id is null),
    count(*) filter (
      where relation.id is not null
        and (relation.status<>'available' or not relation.is_active)
    )
  into added_total,reactivated_total
  from approved
  left join public.shop_brands relation
    on relation.shop_id=p_shop_id and relation.brand_id=approved.brand_id;

  insert into public.shop_product_imports(
    shop_id,source_url,fetched_at,content_sha256,item_count
  ) values(
    p_shop_id,p_source_url,p_fetched_at,p_content_sha256,item_total
  ) returning id into result_id;

  insert into public.shop_brands(
    shop_id,brand_id,created_by,is_active,status
  )
  select p_shop_id,approved.brand_id,null,true,'available'
  from (
    select distinct item.brand_id
    from jsonb_to_recordset(p_items)
      as item(brand_id uuid,source_name text,source_url text)
  ) approved
  on conflict(shop_id,brand_id) do update set
    is_active=true,
    status='available'
  where public.shop_brands.status<>'available'
    or not public.shop_brands.is_active;

  insert into public.shop_product_import_items(
    import_id,brand_id,source_name,source_url
  )
  select distinct on (item.brand_id,trim(item.source_name))
    result_id,item.brand_id,trim(item.source_name),item.source_url
  from jsonb_to_recordset(p_items)
    as item(brand_id uuid,source_name text,source_url text)
  order by item.brand_id,trim(item.source_name),item.source_url nulls last;

  return jsonb_build_object(
    'import_id',result_id,
    'approved_items',item_total,
    'added_brands',added_total,
    'reactivated_brands',reactivated_total,
    'unchanged_brands',
      (
        select count(distinct item.brand_id)
        from jsonb_to_recordset(p_items)
          as item(brand_id uuid,source_name text,source_url text)
      )-added_total-reactivated_total
  );
end
$$;

revoke execute on function public.import_shop_products(
  uuid,text,timestamptz,text,jsonb
) from public,anon,authenticated;
grant execute on function public.import_shop_products(
  uuid,text,timestamptz,text,jsonb
) to service_role;
