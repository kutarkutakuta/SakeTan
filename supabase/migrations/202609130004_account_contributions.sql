create index shop_brands_contributor_idx
  on public.shop_brands(created_by,shop_id,created_at desc)
  where status in ('available','unavailable');
create index shops_contributor_idx
  on public.shops(created_by) where is_active;
create index brand_requests_contributor_idx
  on public.brand_requests(submitted_by,status);

create function public.get_my_contribution_summary() returns jsonb
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
      s.id as shop_id,
      s.name as shop_name,
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
    'resolved_brand_request_count',(
      select count(*)::integer from public.brand_requests br
      where auth.uid() is not null
        and br.submitted_by=auth.uid() and br.status='resolved'
    ),
    'favorite_shops',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'shop_id',fs.shop_id,
          'shop_name',fs.shop_name,
          'contribution_count',fs.contribution_count
        ) order by fs.contribution_count desc,fs.last_contribution_at desc,fs.shop_name
      ) from favorite_shops fs
    ),'[]'::jsonb)
  );
$$;

revoke execute on function public.get_my_contribution_summary()
from public,anon,authenticated;
grant execute on function public.get_my_contribution_summary() to authenticated;
