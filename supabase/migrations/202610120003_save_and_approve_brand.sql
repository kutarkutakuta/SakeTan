-- Save the reviewed brand fields and approve the application in one transaction.
create function public.save_and_approve_brand_application(
  p_brand_id uuid,
  p_data jsonb,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or public.is_anonymous_user() or not public.is_admin() then
    raise exception '管理者のみ承認できます' using errcode='42501';
  end if;
  perform 1 from public.brands
  where id=p_brand_id and registration_status='pending' and is_active
  for update;
  if not found then
    raise exception '有効な申請中の銘柄が見つかりません' using errcode='P0001';
  end if;
  if p_data is null or jsonb_typeof(p_data)<>'object'
    or not (p_data ?& array['name','name_kana','brewery_id']) then
    raise exception '承認する銘柄の名称・かな・酒蔵を確認してください';
  end if;
  if p_data->>'brewery_id' is null then
    raise exception '承認する銘柄の酒蔵を選択してください';
  end if;
  if length(coalesce(p_data->>'name_kana',''))>150 then
    raise exception '銘柄かなは150文字以内で入力してください';
  end if;
  if p_data ? 'is_active' and (p_data->>'is_active')::boolean is distinct from true then
    raise exception '承認する銘柄は有効にしてください';
  end if;
  if length(coalesce(p_reason,''))>500 then
    raise exception '変更理由は500文字以内で入力してください';
  end if;
  perform public.save_master('brand',p_brand_id,p_data||jsonb_build_object('is_active',true),p_reason);
  return public.review_brand_application(p_brand_id,'approve');
end $$;

revoke execute on function public.save_and_approve_brand_application(uuid,jsonb,text)
from public,anon,authenticated;
grant execute on function public.save_and_approve_brand_application(uuid,jsonb,text)
to authenticated;

notify pgrst,'reload schema';
