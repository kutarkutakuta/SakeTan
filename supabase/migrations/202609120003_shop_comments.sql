create table public.shop_comments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  user_id uuid not null references public.users(id),
  comment text not null check(length(trim(comment)) between 1 and 1000),
  commented_on date not null default current_date,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.shop_comments(
  id, shop_id, user_id, comment, commented_on, is_deleted, created_at, updated_at
)
select s.id, sb.shop_id, s.user_id, s.comment, s.observed_at, s.is_deleted,
       s.created_at, s.updated_at
from public.sightings s
join public.shop_brands sb on sb.id = s.shop_brand_id
where s.comment is not null and length(trim(s.comment)) > 0
on conflict(id) do nothing;

create index on public.shop_comments(shop_id, created_at desc) where not is_deleted;

alter table public.shop_comments enable row level security;
create policy read_shop_comments on public.shop_comments for select
using(not is_deleted or user_id=auth.uid() or public.is_admin());

revoke all on public.shop_comments from anon, authenticated;
grant select on public.shop_comments to anon, authenticated;
grant all on public.shop_comments to service_role;

create function public.post_shop_comment(p_shop_id uuid, p_comment text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if not exists(select 1 from public.shops where id=p_shop_id and is_active) then
    raise exception 'この酒屋にはコメントできません' using errcode='P0001';
  end if;
  insert into public.shop_comments(shop_id,user_id,comment)
  values(p_shop_id,auth.uid(),trim(p_comment)) returning id into result_id;
  return result_id;
end $$;

create function public.edit_shop_comment(p_id uuid, p_comment text, p_delete boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare target public.shop_comments;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select * into target from public.shop_comments where id=p_id for update;
  if target.id is null then
    raise exception 'コメントが見つかりません' using errcode='P0001';
  end if;
  if target.user_id<>auth.uid() and not public.is_admin() then
    raise insufficient_privilege;
  end if;
  update public.shop_comments
  set comment=trim(p_comment),is_deleted=p_delete,updated_at=now()
  where id=p_id;
  return p_id;
end $$;

revoke execute on function public.post_shop_comment(uuid,text) from public,anon,authenticated;
revoke execute on function public.edit_shop_comment(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.post_shop_comment(uuid,text) to authenticated;
grant execute on function public.edit_shop_comment(uuid,text,boolean) to authenticated;
