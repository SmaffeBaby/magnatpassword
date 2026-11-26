begin;

create table magnat_internal.password_reset_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  password_fingerprint bytea not null,
  code_hash text not null unique,
  sealed_code jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create view magnat_internal.active_password_resets as
select r.*
from magnat_internal.password_reset_requests r
join auth.users u on u.id = r.user_id
where r.expires_at > now()
  and r.email = lower(u.email)
  and r.password_fingerprint = extensions.digest(coalesce(u.encrypted_password, ''), 'sha256')
  and u.email_confirmed_at is not null
  and u.deleted_at is null
  and not u.is_sso_user
  and (u.banned_until is null or u.banned_until <= now());

create function public.password_reset_request(p_email text, p_code_hash text, p_sealed_code jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  account auth.users%rowtype;
begin
  select u.* into account from auth.users u
  where lower(u.email) = p_email and u.email_confirmed_at is not null and u.deleted_at is null
    and not u.is_sso_user and (u.banned_until is null or u.banned_until <= now())
  for no key update;
  if not found then return; end if;

  -- Keep an outstanding code valid when the same address submits again.
  if exists (select 1 from magnat_internal.active_password_resets where user_id = account.id) then
    return;
  end if;
  insert into magnat_internal.password_reset_requests (user_id, email, password_fingerprint, code_hash, sealed_code)
  values (account.id, lower(account.email), extensions.digest(coalesce(account.encrypted_password, ''), 'sha256'), p_code_hash, p_sealed_code)
  on conflict (user_id) do update set
    email = excluded.email, password_fingerprint = excluded.password_fingerprint,
    code_hash = excluded.code_hash, sealed_code = excluded.sealed_code,
    created_at = excluded.created_at, expires_at = excluded.expires_at;
end;
$$;

create function public.password_reset_inbox()
returns table (email text, code_hash text, sealed_code jsonb, created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.email, r.code_hash, r.sealed_code, r.created_at, r.expires_at
  from magnat_internal.active_password_resets r
  order by r.created_at desc limit 100;
$$;

create function public.password_reset_apply(p_email text, p_code_hash text, p_password text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid;
begin
  select user_id into account_id from magnat_internal.active_password_resets
  where code_hash = p_code_hash and email = p_email;
  if not found then return false; end if;
  if p_password is null then return true; end if;

  -- Request creation and completion serialize on the same account row.
  perform 1 from auth.users where id = account_id for no key update;
  if not exists (
    select 1 from magnat_internal.active_password_resets
    where user_id = account_id and code_hash = p_code_hash and email = p_email
      and expires_at > clock_timestamp()
  ) then return false; end if;

  if char_length(p_password) < 12 or octet_length(p_password) > 72 then
    raise exception 'Invalid password length';
  end if;

  -- Match the bcrypt format used by the bundled Supabase Auth service.
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    updated_at = now(), confirmation_token = '', confirmation_sent_at = null,
    recovery_token = '', recovery_sent_at = null, email_change_token_current = '',
    email_change_token_new = '', email_change_sent_at = null, phone_change_token = '',
    phone_change_sent_at = null, reauthentication_token = '', reauthentication_sent_at = null
  where id = account_id;
  delete from auth.one_time_tokens where user_id = account_id;
  delete from auth.sessions where user_id = account_id;
  delete from auth.refresh_tokens where user_id = account_id::text;
  delete from magnat_internal.password_reset_requests where user_id = account_id;
  return true;
end;
$$;

revoke all on function public.password_reset_request(text, text, jsonb),
  public.password_reset_inbox(), public.password_reset_apply(text, text, text)
  from public, anon, authenticated;
grant execute on function public.password_reset_request(text, text, jsonb),
  public.password_reset_inbox(), public.password_reset_apply(text, text, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
