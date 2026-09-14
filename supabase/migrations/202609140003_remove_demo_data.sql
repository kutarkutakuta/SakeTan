alter table public.change_histories disable trigger immutable_history;

delete from public.change_histories
where changed_by='de000000-0000-4000-8000-000000000001'::uuid
  or (
    entity_type='shop'
    and entity_id=any(array[
      'de000000-0000-4000-8000-000000000101'::uuid,
      'de000000-0000-4000-8000-000000000102'::uuid,
      'de000000-0000-4000-8000-000000000103'::uuid,
      'de000000-0000-4000-8000-000000000104'::uuid
    ])
  )
  or (
    entity_type='shop_brand'
    and entity_id in (
      select id
      from public.shop_brands
      where shop_id=any(array[
        'de000000-0000-4000-8000-000000000101'::uuid,
        'de000000-0000-4000-8000-000000000102'::uuid,
        'de000000-0000-4000-8000-000000000103'::uuid,
        'de000000-0000-4000-8000-000000000104'::uuid
      ])
    )
  );

alter table public.change_histories enable trigger immutable_history;

delete from public.shop_comments
where user_id='de000000-0000-4000-8000-000000000001'::uuid
  or shop_id=any(array[
    'de000000-0000-4000-8000-000000000101'::uuid,
    'de000000-0000-4000-8000-000000000102'::uuid,
    'de000000-0000-4000-8000-000000000103'::uuid,
    'de000000-0000-4000-8000-000000000104'::uuid
  ]);

delete from public.sightings
where user_id='de000000-0000-4000-8000-000000000001'::uuid
  or shop_brand_id in (
    select id
    from public.shop_brands
    where shop_id=any(array[
      'de000000-0000-4000-8000-000000000101'::uuid,
      'de000000-0000-4000-8000-000000000102'::uuid,
      'de000000-0000-4000-8000-000000000103'::uuid,
      'de000000-0000-4000-8000-000000000104'::uuid
    ])
  );

delete from public.brand_requests
where submitted_by='de000000-0000-4000-8000-000000000001'::uuid;

update public.brand_requests
set shop_id=null
where shop_id=any(array[
  'de000000-0000-4000-8000-000000000101'::uuid,
  'de000000-0000-4000-8000-000000000102'::uuid,
  'de000000-0000-4000-8000-000000000103'::uuid,
  'de000000-0000-4000-8000-000000000104'::uuid
]);

update public.brand_requests
set reviewed_by=null
where reviewed_by='de000000-0000-4000-8000-000000000001'::uuid;

delete from public.shop_brands
where shop_id=any(array[
  'de000000-0000-4000-8000-000000000101'::uuid,
  'de000000-0000-4000-8000-000000000102'::uuid,
  'de000000-0000-4000-8000-000000000103'::uuid,
  'de000000-0000-4000-8000-000000000104'::uuid
]);

delete from public.shops
where id=any(array[
  'de000000-0000-4000-8000-000000000101'::uuid,
  'de000000-0000-4000-8000-000000000102'::uuid,
  'de000000-0000-4000-8000-000000000103'::uuid,
  'de000000-0000-4000-8000-000000000104'::uuid
]);

update public.breweries
set created_by=null
where created_by='de000000-0000-4000-8000-000000000001'::uuid;

update public.brands
set created_by=null
where created_by='de000000-0000-4000-8000-000000000001'::uuid;

update public.shops
set created_by=null
where created_by='de000000-0000-4000-8000-000000000001'::uuid;

update public.shop_brands
set created_by=null
where created_by='de000000-0000-4000-8000-000000000001'::uuid;

delete from auth.users
where id='de000000-0000-4000-8000-000000000001'::uuid;
