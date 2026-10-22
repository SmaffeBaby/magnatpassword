begin;
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null check(jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);
create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('shared','subscription')),
  dedupe_key text not null,
  source_vault uuid references public.shared_vaults(id) on delete cascade,
  vault_id text,
  entry_id uuid,
  field_id uuid,
  title text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(user_id,dedupe_key)
);
create index if not exists app_notifications_user_date on public.app_notifications(user_id,created_at desc);
alter table public.notification_preferences enable row level security;
alter table public.app_notifications enable row level security;
revoke all on public.notification_preferences,public.app_notifications from public,anon,authenticated;
grant all on public.notification_preferences,public.app_notifications to service_role;
create or replace function public.notify_shared_change(p_actor uuid,p_vault uuid,p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.shared_vaults%rowtype;
begin
 select * into v from public.shared_vaults where id=p_vault;
 insert into public.app_notifications(user_id,kind,dedupe_key,source_vault,vault_id,title,message)
 select m.user_id,'shared',p_vault::text||'/'||v.revision::text||'/'||p_action,p_vault,p_vault::text,
 'Общее хранилище обновлено',
 'В хранилище «'||v.name||'» '||case when p_action='rename' then 'изменено название' when p_action in ('invite','revoke') then 'изменён состав участников' else 'обновлены записи' end||'.'
 from public.shared_vault_members m left join public.notification_preferences p on p.user_id=m.user_id
 where m.vault_id=p_vault and m.user_id<>p_actor and coalesce((p.settings->>'sharedChanges')::boolean,true)
 on conflict(user_id,dedupe_key) do nothing;
end $$;
revoke all on function public.notify_shared_change(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.notify_shared_change(uuid,uuid,text) to service_role;
create or replace function public.shared_vault_mutate(p_actor uuid, p_action text, p_id uuid, p_revision integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.shared_vaults%rowtype;
  target uuid;
begin
  if p_action = 'create' then
    insert into public.shared_vaults(id, owner_id, name, encrypted_data) values (p_id, p_actor, p_payload->>'name', p_payload->'encryptedData');
    insert into public.shared_vault_members values (p_id, p_actor);
    perform public.notify_shared_change(p_actor,p_id,p_action);
    return jsonb_build_object('ok', true);
  end if;
  select * into v from public.shared_vaults where id = p_id for update;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  if not exists (select 1 from public.shared_vault_members where vault_id = p_id and user_id = p_actor) then raise exception 'ACCESS_DENIED'; end if;
  if p_action <> 'save' and v.owner_id <> p_actor then raise exception 'ACCESS_DENIED'; end if;
  if v.revision <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
  if p_action = 'save' then
    update public.shared_vaults set encrypted_data = p_payload->'encryptedData' where id = p_id;
  elsif p_action = 'rename' then
    update public.shared_vaults set name = btrim(p_payload->>'name') where id = p_id;
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
  perform public.notify_shared_change(p_actor,p_id,p_action);
    return jsonb_build_object('ok', true);
end $$;
revoke all on function public.shared_vault_mutate(uuid,text,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.shared_vault_mutate(uuid,text,uuid,integer,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
