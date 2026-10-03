-- brand_requests was the pre-registration-status intake table. Pending rows
-- were migrated to brands and brand_applications in 202609280001.

-- Keep the contribution RPC response backward compatible while removing its
-- dependency on the legacy table. The field is retained as zero for clients
-- that still decode the old response shape.
create or replace function public.get_my_contribution_summary() returns jsonb
language sql stable security definer set search_path='' as $$
  with valid_relations as (
    select sb.shop_id,sb.created_at
    from public.shop_brands sb
    join public.shops s on s.id=sb.shop_id and s.is_active
    join public.brands b on b.id=sb.brand_id and b.is_active
    where auth.uid() is not null
      and sb.created_by=auth.uid()
      and sb.status in ('available','unavailable')
  ), favorite_shops as (
    select
      s.id as shop_id,s.name as shop_name,
      count(*)::integer as contribution_count,
      max(vr.created_at) as last_contribution_at
    from valid_relations vr
    join public.shops s on s.id=vr.shop_id
    group by s.id,s.name
    having count(*)>=2
    order by count(*) desc,max(vr.created_at) desc,s.name
    limit 3
  )
  select jsonb_build_object(
    'shop_brand_count',(select count(*)::integer from valid_relations),
    'shop_count',(
      select count(*)::integer from public.shops s
      where auth.uid() is not null and s.created_by=auth.uid() and s.is_active
    ),
    'approved_brand_application_count',(
      select count(*)::integer from public.brands b
      join public.brand_applications a on a.brand_id=b.id
      where auth.uid() is not null and b.created_by=auth.uid()
        and a.resolution='approved'
    ),
    'resolved_brand_request_count',0,
    'favorite_shops',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'shop_id',fs.shop_id,'shop_name',fs.shop_name,
          'contribution_count',fs.contribution_count
        ) order by fs.contribution_count desc,fs.last_contribution_at desc,fs.shop_name
      ) from favorite_shops fs
    ),'[]'::jsonb)
  );
$$;

-- Anonymous account transfer used to move ownership on brand_requests too.
-- Recreate it without the retired table before dropping that table.
create or replace function public.claim_anonymous_account_transfer(p_token uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare source_user uuid;
begin
  if auth.uid() is null or exists(
    select 1 from auth.users
    where id=auth.uid() and is_anonymous
  ) then
    raise exception '保存済みアカウントでログインしてください' using errcode='42501';
  end if;

  select anonymous_user_id into source_user
  from saketan_private.anonymous_account_transfers
  where token=p_token and expires_at>now()
  for update;
  if source_user is null or not exists(
    select 1 from auth.users where id=source_user and is_anonymous
  ) then
    raise exception '引き継ぎ情報が見つかりません' using errcode='42501';
  end if;

  perform set_config('saketan.account_transfer','true',true);
  update public.breweries set created_by=auth.uid() where created_by=source_user;
  update public.brands set created_by=auth.uid() where created_by=source_user;
  update public.shops set created_by=auth.uid() where created_by=source_user;
  update public.shop_brands set created_by=auth.uid() where created_by=source_user;
  update public.sightings set user_id=auth.uid() where user_id=source_user;
  update public.shop_comments set user_id=auth.uid() where user_id=source_user;

  update public.change_histories
  set changed_by=auth.uid()
  where changed_by=source_user;
  perform set_config('saketan.account_transfer','false',true);

  delete from saketan_private.anonymous_account_transfers where token=p_token;
  return source_user;
end $$;

drop function if exists public.submit_brand_request(text,text,text,uuid);
drop function if exists public.review_brand_request(uuid,text);
drop table if exists public.brand_requests;
