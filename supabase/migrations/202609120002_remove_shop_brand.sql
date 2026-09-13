create function public.remove_shop_brand(p_shop_id uuid, p_brand_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare target public.shop_brands;
begin
  if auth.uid() is null then
    raise exception 'ログインしてください' using errcode = '42501';
  end if;

  select * into target
  from public.shop_brands
  where shop_id = p_shop_id and brand_id = p_brand_id
  for update;

  if target.id is null then
    raise exception '取扱情報が見つかりません';
  end if;
  if target.created_by is distinct from auth.uid() and not public.is_admin() then
    raise exception '自分が追加した取扱情報だけ削除できます' using errcode = '42501';
  end if;

  update public.shop_brands
  set is_active = false, updated_at = now()
  where id = target.id;

  return target.id;
end
$$;

revoke execute on function public.remove_shop_brand(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.remove_shop_brand(uuid, uuid) to authenticated;
