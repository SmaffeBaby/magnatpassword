begin;

create or replace function public.team_profile_overview(p_actor uuid, p_target uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'lastSeenAt', presence.last_seen,
    'online', exists (
      select 1 from public.account_devices d
      join auth.sessions s on s.id = d.session_id
      where d.user_id = profile.user_id and d.last_seen >= now() - interval '75 seconds'
        and (s.not_after is null or s.not_after > now())
    ),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', case when public.project_permission(p_actor, p.id) is not null then p.id end,
        'name', p.name
      ) order by lower(p.name), p.id)
      from public.projects p
      left join public.project_members m on m.project_id = p.id and m.user_id = p_target
      where (p.owner_id = p_target or m.user_id is not null)
        and public.project_permission(p_target, p.id) is not null
    ), '[]'::jsonb)
  )
  from public.team_profiles profile
  left join public.account_presence presence on presence.user_id = profile.user_id
  where profile.user_id = p_target;
$$;

revoke all on function public.team_profile_overview(uuid, uuid) from public, anon, authenticated;
grant execute on function public.team_profile_overview(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
