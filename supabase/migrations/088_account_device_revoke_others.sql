begin;

create function public.account_device_revoke_others(p_actor uuid, p_current_session uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  other_session uuid;
  revoked integer := 0;
begin
  -- Serialize bulk requests from different sessions of the same account.
  perform 1 from auth.users where id = p_actor for no key update;
  if not found then return null; end if;

  perform 1 from auth.sessions
  where id = p_current_session and user_id = p_actor and (not_after is null or not_after > now())
  for update;
  if not found then return null; end if;

  for other_session in
    select id from auth.sessions where user_id = p_actor and id <> p_current_session order by id
  loop
    if public.account_device_revoke(p_actor, other_session) then
      revoked := revoked + 1;
    end if;
  end loop;
  return revoked;
end;
$$;

revoke all on function public.account_device_revoke_others(uuid, uuid) from public, anon, authenticated;
grant execute on function public.account_device_revoke_others(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
