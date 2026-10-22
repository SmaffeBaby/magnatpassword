begin;
create table if not exists public.shared_vaults (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  encrypted_data jsonb not null check (jsonb_typeof(encrypted_data) = 'object'),
  revision integer not null default 1 check (revision > 0),
  key_epoch integer not null default 1 check (key_epoch > 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.shared_vault_members (
  vault_id uuid not null references public.shared_vaults(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (vault_id, user_id)
);
create index if not exists shared_vault_members_user on public.shared_vault_members(user_id);
alter table public.shared_vaults enable row level security;
alter table public.shared_vault_members enable row level security;
-- Access goes through authenticated application routes. No direct client writes.
revoke all on public.shared_vaults, public.shared_vault_members from public, anon, authenticated;
grant all on public.shared_vaults, public.shared_vault_members to service_role;

-- These narrowly scoped functions can read auth.users; only service_role may execute them.
-- A single row lock serializes content updates and membership/key changes.
create or replace function public.shared_vault_mutate(p_actor uuid, p_action text, p_id uuid, p_revision integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.shared_vaults%rowtype;
  target uuid;
begin
  if p_action = 'create' then
    insert into public.shared_vaults(id, owner_id, name, encrypted_data) values (p_id, p_actor, p_payload->>'name', p_payload->'encryptedData');
    insert into public.shared_vault_members values (p_id, p_actor);
    return jsonb_build_object('ok', true);
  end if;
  select * into v from public.shared_vaults where id = p_id for update;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  if not exists (select 1 from public.shared_vault_members where vault_id = p_id and user_id = p_actor) then raise exception 'ACCESS_DENIED'; end if;
  if p_action <> 'save' and v.owner_id <> p_actor then raise exception 'ACCESS_DENIED'; end if;
  if v.revision <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
  if p_action = 'save' then
    update public.shared_vaults set encrypted_data = p_payload->'encryptedData' where id = p_id;
  elsif p_action = 'invite' then
    select id into target from auth.users where lower(email) = lower(btrim(p_payload->>'email')) and deleted_at is null;
    if target is null then raise exception 'USER_NOT_FOUND'; end if;
    if exists (select 1 from public.shared_vault_members where vault_id = p_id and user_id = target) then raise exception 'ALREADY_MEMBER'; end if;
    insert into public.shared_vault_members(vault_id, user_id) values (p_id, target);
  elsif p_action = 'revoke' then
    target := (p_payload->>'userId')::uuid;
    if target = v.owner_id then raise exception 'OWNER_REQUIRED'; end if;
    if not exists (select 1 from public.shared_vault_members where vault_id = p_id and user_id = target) then raise exception 'ACCESS_DENIED'; end if;
    delete from public.shared_vault_members where vault_id = p_id and user_id = target;
    update public.shared_vaults set encrypted_data = p_payload->'encryptedData', key_epoch = key_epoch + 1 where id = p_id;
  else
    raise exception 'INVALID_ACTION';
  end if;
  update public.shared_vaults set revision = revision + 1, updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.shared_vault_mutate(uuid,text,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.shared_vault_mutate(uuid,text,uuid,integer,jsonb) to service_role;

-- Directory data is limited to members of vaults the actor belongs to.
create or replace function public.shared_vault_directory(p_actor uuid)
returns table(vault_id uuid, user_id uuid, email text, brand text)
language sql stable security definer set search_path = '' as $$
 select m.vault_id, m.user_id, u.email::text,
 case when u.raw_user_meta_data->>'account_brand' = 'light' then 'light' else 'magnat' end
 from public.shared_vault_members m join auth.users u on u.id = m.user_id
 where exists (select 1 from public.shared_vault_members mine where mine.vault_id = m.vault_id and mine.user_id = p_actor);
$$;
revoke all on function public.shared_vault_directory(uuid) from public, anon, authenticated;
grant execute on function public.shared_vault_directory(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
