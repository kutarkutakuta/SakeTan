create schema if not exists saketan_private;
revoke all on schema saketan_private from public,anon,authenticated;

create table saketan_private.anonymous_account_transfers (
  token uuid primary key default gen_random_uuid(),
  anonymous_user_id uuid not null unique references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now()+interval '15 minutes',
  created_at timestamptz not null default now()
);
revoke all on saketan_private.anonymous_account_transfers
from public,anon,authenticated;

create or replace function public.immutable_history() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE'
    and current_setting('saketan.account_transfer',true)='true'
    and (to_jsonb(new)-'changed_by')=(to_jsonb(old)-'changed_by')
  then
    return new;
  end if;
  raise exception '履歴は編集・削除できません' using errcode='42501';
end $$;

create or replace function public.audit_master() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous jsonb; current_data jsonb; verb text; kind text;
begin
  if current_setting('saketan.account_transfer',true)='true' then
    return new;
  end if;
  new.updated_at=now();
  if auth.uid() is null then return new; end if;
  current_data=to_jsonb(new);
  previous=case when tg_op='UPDATE' then to_jsonb(old) else null end;
  if previous is not null
    and (previous-'updated_at')=(current_data-'updated_at')
    and coalesce(current_setting('saketan.restore',true),'')<>'true'
  then return new; end if;
  kind=case tg_table_name
    when 'breweries' then 'brewery'
    when 'brands' then 'brand'
    when 'shops' then 'shop'
    else 'shop_brand'
  end;
  verb=case
    when current_setting('saketan.restore',true)='true' then 'restore'
    when tg_op='INSERT' then 'create'
    when tg_table_name<>'shop_brands' and old.is_active and not new.is_active then 'deactivate'
    else 'update'
  end;
  insert into public.change_histories(
    entity_type,entity_id,action,before_data,after_data,changed_by,reason
  ) values(
    kind,new.id,verb,previous,current_data,auth.uid(),
    nullif(current_setting('saketan.reason',true),'')
  );
  return new;
end $$;

create function public.begin_anonymous_account_transfer() returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if auth.uid() is null or not exists(
    select 1 from auth.users
    where id=auth.uid() and is_anonymous
  ) then
    raise exception '匿名ユーザーではありません' using errcode='42501';
  end if;

  insert into saketan_private.anonymous_account_transfers(
    token,anonymous_user_id,expires_at
  ) values(
    gen_random_uuid(),auth.uid(),now()+interval '15 minutes'
  )
  on conflict(anonymous_user_id) do update set
    token=gen_random_uuid(),expires_at=now()+interval '15 minutes',created_at=now()
  returning token into result;
  return result;
end $$;

create function public.claim_anonymous_account_transfer(p_token uuid) returns uuid
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
  update public.brand_requests set submitted_by=auth.uid() where submitted_by=source_user;
  update public.brand_requests set reviewed_by=auth.uid() where reviewed_by=source_user;

  update public.change_histories
  set changed_by=auth.uid()
  where changed_by=source_user;
  perform set_config('saketan.account_transfer','false',true);

  delete from saketan_private.anonymous_account_transfers where token=p_token;
  return source_user;
end $$;

revoke execute on function public.begin_anonymous_account_transfer(),
  public.claim_anonymous_account_transfer(uuid)
from public,anon,authenticated;
grant execute on function public.begin_anonymous_account_transfer(),
  public.claim_anonymous_account_transfer(uuid)
to authenticated;
