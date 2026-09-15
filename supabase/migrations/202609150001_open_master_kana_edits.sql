create function public.update_master_kana(
  p_type text,
  p_id uuid,
  p_name_kana text,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  normalized_kana text:=nullif(trim(p_name_kana),'');
  result_id uuid;
begin
  if auth.uid() is null or public.is_anonymous_user() then
    raise exception 'ログインしてください' using errcode='42501';
  end if;
  if p_type not in ('brand','brewery') then
    raise exception 'かなを編集できるのは銘柄と酒蔵のみです';
  end if;
  if p_id is null then
    raise exception '対象が見つかりません';
  end if;
  if length(coalesce(normalized_kana,''))>150 then
    raise exception 'かなは150文字以内で入力してください';
  end if;
  if length(coalesce(trim(p_reason),''))>500 then
    raise exception '変更理由は500文字以内で入力してください';
  end if;

  perform set_config('saketan.reason',coalesce(trim(p_reason),''),true);
  if p_type='brand' then
    update public.brands
    set name_kana=normalized_kana
    where id=p_id and name_kana is distinct from normalized_kana
    returning id into result_id;
    if result_id is null then
      select id into result_id from public.brands where id=p_id;
    end if;
  else
    update public.breweries
    set name_kana=normalized_kana
    where id=p_id and name_kana is distinct from normalized_kana
    returning id into result_id;
    if result_id is null then
      select id into result_id from public.breweries where id=p_id;
    end if;
  end if;
  if result_id is null then raise exception '対象が見つかりません'; end if;
  return result_id;
end $$;

revoke execute on function public.update_master_kana(text,uuid,text,text)
from public,anon,authenticated;
grant execute on function public.update_master_kana(text,uuid,text,text)
to authenticated;
