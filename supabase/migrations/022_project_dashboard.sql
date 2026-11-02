begin;
create table if not exists public.project_dashboard_preferences (
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 layout jsonb not null check(jsonb_typeof(layout) = 'object'),
 revision integer not null default 1 check(revision > 0),
 primary key(project_id,user_id)
);
alter table public.project_dashboard_preferences enable row level security;
revoke all on public.project_dashboard_preferences from public,anon,authenticated;
grant all on public.project_dashboard_preferences to service_role;

-- Personal presentation settings are editable by viewers too. Project data is unchanged.
create or replace function public.project_dashboard(p_actor uuid,p_id uuid,p_revision integer default null,p_layout jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.projects%rowtype; permission text; prefs public.project_dashboard_preferences%rowtype;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_id for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 if project.owner_id=p_actor then permission:='owner';
 else select m.permission into permission from public.project_members m where m.project_id=p_id and m.user_id=p_actor; end if;
 if permission is null or permission='hidden' then raise exception 'PROJECT_NOT_FOUND'; end if;
 select * into prefs from public.project_dashboard_preferences where project_id=p_id and user_id=p_actor;
 if p_layout is not null then
  if coalesce(prefs.revision,0) is distinct from p_revision then raise exception 'REVISION_CONFLICT'; end if;
  insert into public.project_dashboard_preferences(project_id,user_id,layout) values(p_id,p_actor,p_layout)
   on conflict(project_id,user_id) do update set layout=excluded.layout,revision=project_dashboard_preferences.revision+1
   returning * into prefs;
 end if;
 return jsonb_build_object('revision',coalesce(prefs.revision,0),'layout',prefs.layout);
end $$;
revoke all on function public.project_dashboard(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.project_dashboard(uuid,uuid,integer,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
