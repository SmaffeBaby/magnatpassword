begin;
create table if not exists public.account_access_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  remember_password boolean not null default false,
  logout_minutes integer not null default 5 check (logout_minutes in (0,5,10,15,20,30,60,120)),
  updated_at timestamptz not null default now()
);
alter table public.account_access_settings enable row level security;
revoke all on public.account_access_settings from anon, authenticated;
grant all on public.account_access_settings to service_role;
create table if not exists public.account_devices (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('web','app')),
  platform text not null check (length(platform) <= 80),
  browser text not null check (length(browser) <= 80),
  last_seen timestamptz not null default now()
);
alter table public.account_devices enable row level security;
revoke all on public.account_devices from anon, authenticated;
grant all on public.account_devices to service_role;

create or replace function public.account_session_active(p_actor uuid, p_session uuid)
returns boolean language sql security definer set search_path = '' as $$
  select exists(select 1 from auth.sessions where id=p_session and user_id=p_actor and (not_after is null or not_after>now()));
$$;

create or replace function public.account_device_touch(p_actor uuid, p_session uuid, p_kind text, p_platform text, p_browser text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize with revocation; a heartbeat must never recreate a deleted session.
  perform 1 from auth.sessions where id=p_session and user_id=p_actor and (not_after is null or not_after>now()) for update;
  if not found then return false; end if;
  insert into public.account_devices(session_id,user_id,kind,platform,browser,last_seen)
    values(p_session,p_actor,p_kind,p_platform,p_browser,now())
    on conflict(session_id) do update set kind=excluded.kind,platform=excluded.platform,browser=excluded.browser,last_seen=now();
  return true;
end;
$$;

create or replace function public.account_device_list(p_actor uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'kind',d.kind,'platform',d.platform,'browser',d.browser,
    'userAgent',s.user_agent,'createdAt',s.created_at,
    'lastSeen',coalesce(d.last_seen,s.refreshed_at::timestamptz,s.updated_at,s.created_at)
  ) order by coalesce(d.last_seen,s.refreshed_at::timestamptz,s.updated_at,s.created_at) desc),'[]'::jsonb)
  from auth.sessions s left join public.account_devices d on d.session_id=s.id
  where s.user_id=p_actor and (s.not_after is null or s.not_after>now());
$$;

create or replace function public.account_device_revoke(p_actor uuid, p_session uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from auth.sessions where id=p_session and user_id=p_actor for update;
  if not found then return false; end if;
  delete from auth.refresh_tokens where session_id=p_session and user_id=p_actor::text;
  delete from auth.sessions where id=p_session and user_id=p_actor;
  return true;
end;
$$;

revoke all on function public.account_session_active(uuid,uuid), public.account_device_touch(uuid,uuid,text,text,text), public.account_device_list(uuid), public.account_device_revoke(uuid,uuid) from public, anon, authenticated;
grant execute on function public.account_session_active(uuid,uuid), public.account_device_touch(uuid,uuid,text,text,text), public.account_device_list(uuid), public.account_device_revoke(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
