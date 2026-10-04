-- Keep anonymous editing within a smaller rolling one-hour quota.
create or replace function public.assert_change_quota(p_max integer) returns void
language plpgsql security definer set search_path='' as $$
declare recent_count integer;
begin
  if auth.uid() is null then
    raise exception '操作ユーザーを確認できません' using errcode='42501';
  end if;

  -- Signed-in users can make repeated changes. Anonymous sessions remain rate-limited.
  if not public.is_anonymous_user() then
    return;
  end if;

  p_max := least(p_max, 10);

  select count(*)::integer into recent_count
  from public.change_histories
  where changed_by=auth.uid()
    and created_at>now()-interval '1 hour'
    and coalesce(reason,'') not like '取扱銘柄一括コピー:%';
  if recent_count>=p_max then
    raise exception '短時間の変更回数が上限に達しました。時間をおいてお試しください'
      using errcode='P0001';
  end if;
end $$;
