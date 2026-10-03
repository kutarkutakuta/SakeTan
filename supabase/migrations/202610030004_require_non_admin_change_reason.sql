-- Ordinary users must explain master kana changes with a meaningful reason.
create or replace function public.update_master_kana(
  p_type text,
  p_id uuid,
  p_name_kana text,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  normalized_kana text:=nullif(trim(p_name_kana),'');
  normalized_reason text:=nullif(trim(p_reason),'');
  compact_reason text:=regexp_replace(coalesce(normalized_reason,''),'[[:space:]　]','','g');
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
  if length(coalesce(normalized_reason,''))>500 then
    raise exception '変更理由は500文字以内で入力してください';
  end if;
  if not public.is_admin() then
    if normalized_reason is null then
      raise exception '変更理由を入力してください';
    end if;
    if length(compact_reason)<2
      or translate(compact_reason,left(compact_reason,1),'')=''
    then
      raise exception '変更理由は、同じ文字の繰り返しではなく具体的に入力してください';
    end if;
  end if;

  perform set_config('saketan.reason',coalesce(normalized_reason,''),true);
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
