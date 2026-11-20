begin;

alter table public.project_chats add column if not exists avatar text not null default ''
  check (length(avatar) <= 700000 and project_id is not null or avatar = '');

-- Device rows disappear when sessions end. Retain only the most recent heartbeat per account.
create table if not exists public.account_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null
);
alter table public.account_presence enable row level security;
revoke all on public.account_presence from public, anon, authenticated;

create or replace function public.account_presence_touch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.account_presence(user_id, last_seen) values (new.user_id, new.last_seen)
  on conflict (user_id) do update set last_seen = greatest(account_presence.last_seen, excluded.last_seen);
  return null;
end $$;

revoke all on function public.account_presence_touch() from public, anon, authenticated;
drop trigger if exists account_presence_touch on public.account_devices;
create trigger account_presence_touch after insert or update of last_seen on public.account_devices
for each row execute function public.account_presence_touch();

insert into public.account_presence(user_id, last_seen)
select user_id, max(last_seen) from public.account_devices group by user_id
on conflict (user_id) do update set last_seen = greatest(account_presence.last_seen, excluded.last_seen);

create or replace function public.project_chat_header(p_actor uuid, p_project uuid, p_chat uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  peer uuid;
  last_seen timestamptz;
  online boolean;
begin
  perform public.project_chat_check(p_actor, p_project, p_chat);
  if p_project is not null then
    return (select jsonb_build_object('avatar', avatar) from public.project_chats where id = p_chat);
  end if;

  select user_id into peer from public.project_chat_members where chat_id = p_chat and user_id <> p_actor limit 1;
  select presence.last_seen into last_seen from public.account_presence presence where user_id = peer;
  select last_seen >= now() - interval '75 seconds' and exists (
    select 1 from public.account_devices device
    join auth.sessions session on session.id = device.session_id
    where device.user_id = peer and device.last_seen >= now() - interval '75 seconds'
      and (session.not_after is null or session.not_after > now())
  ) into online;
  return jsonb_build_object('peerId', peer, 'lastSeenAt', last_seen, 'online', coalesce(online, false));
end $$;

create or replace function public.project_chat_set_avatar(p_actor uuid, p_project uuid, p_chat uuid, p_revision integer, p_avatar text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  chat public.project_chats%rowtype;
begin
  if p_project is null then raise exception 'ACCESS_DENIED'; end if;
  perform 1 from public.projects where id = p_project for share;
  select * into chat from public.project_chats where id = p_chat and project_id = p_project for update;
  perform public.project_chat_check(p_actor, p_project, p_chat);
  if chat.created_by is distinct from p_actor then raise exception 'ACCESS_DENIED'; end if;
  if chat.revision <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
  update public.project_chats set avatar = p_avatar, revision = revision + 1 where id = p_chat;
  perform public.project_chat_signal(p_chat);
end $$;

revoke all on function public.project_chat_header(uuid, uuid, uuid), public.project_chat_set_avatar(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.project_chat_header(uuid, uuid, uuid), public.project_chat_set_avatar(uuid, uuid, uuid, integer, text) to service_role;
notify pgrst, 'reload schema';
commit;
