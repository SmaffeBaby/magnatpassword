begin;

create or replace function public.admin_online_users()
returns integer language sql stable security definer set search_path = '' as $$
  select count(distinct d.user_id)::integer
  from public.account_devices d
  join auth.sessions s on s.id = d.session_id and s.user_id = d.user_id
  where d.last_seen >= now() - interval '75 seconds'
    and (s.not_after is null or s.not_after > now());
$$;

revoke all on function public.admin_online_users() from public, anon, authenticated;
grant execute on function public.admin_online_users() to service_role;
notify pgrst, 'reload schema';
commit;
