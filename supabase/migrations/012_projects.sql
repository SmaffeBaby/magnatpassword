begin;
create table if not exists public.project_access (
 user_id uuid primary key references public.team_profiles(user_id) on delete cascade,
 granted_by uuid references auth.users(id) on delete set null,
 granted_at timestamptz not null default now()
);
create table if not exists public.projects (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.team_profiles(user_id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 120),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.project_members (
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references public.team_profiles(user_id) on delete cascade,
 permission text not null check(permission in ('viewer','editor','hidden')),
 primary key(project_id,user_id)
);
create index if not exists project_members_user on public.project_members(user_id,project_id);
create index if not exists projects_owner on public.projects(owner_id);
alter table public.project_access enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
revoke all on public.project_access,public.projects,public.project_members from public,anon,authenticated;
grant all on public.project_access,public.projects,public.project_members to service_role;

create or replace function public.set_project_access(p_actor uuid,p_user uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.site_admins where user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 if not exists(select 1 from public.team_profiles where user_id=p_user) then raise exception 'USER_NOT_FOUND'; end if;
 if p_enabled then
  insert into public.project_access(user_id,granted_by) values(p_user,p_actor) on conflict(user_id) do nothing;
 else
  delete from public.project_access where user_id=p_user;
 end if;
end $$;

create or replace function public.project_mutate(p_actor uuid,p_action text,p_id uuid,p_revision integer,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare project public.projects%rowtype; target uuid; permission text; actor_permission text;
begin
 -- Keep grants stable until the mutation commits; revoking a grant waits for active writes.
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 if p_action='create' then
  insert into public.projects(id,owner_id,name) values(p_id,p_actor,btrim(p_payload->>'name'));
  return;
 end if;
 select * into project from public.projects where id=p_id for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 if project.owner_id=p_actor then actor_permission:='owner';
 else select m.permission into actor_permission from public.project_members m where m.project_id=p_id and m.user_id=p_actor; end if;
 if actor_permission is null or actor_permission='hidden' then raise exception 'PROJECT_NOT_FOUND'; end if;
 if p_action='rename' and actor_permission not in ('owner','editor') then raise exception 'ACCESS_DENIED'; end if;
 if p_action in ('member','remove_member') and actor_permission<>'owner' then raise exception 'ACCESS_DENIED'; end if;
 if project.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if p_action='rename' then
  update public.projects set name=btrim(p_payload->>'name'),revision=revision+1,updated_at=now() where id=p_id;
 elsif p_action in ('member','remove_member') then
  target:=(p_payload->>'userId')::uuid;
  if target=project.owner_id then raise exception 'OWNER_REQUIRED'; end if;
  if p_action='member' then
   permission:=p_payload->>'permission';
   if permission not in ('viewer','editor','hidden') or permission is null then raise exception 'INVALID_PERMISSION'; end if;
   -- A revoked participant may still be hidden or have their existing permission changed.
   if not exists(select 1 from public.project_members where project_id=p_id and user_id=target) and not exists(select 1 from public.project_access where user_id=target) then raise exception 'USER_NOT_ELIGIBLE'; end if;
   insert into public.project_members(project_id,user_id,permission) values(p_id,target,permission)
    on conflict(project_id,user_id) do update set permission=excluded.permission;
  else
   delete from public.project_members where project_id=p_id and user_id=target;
  end if;
  update public.projects set revision=revision+1,updated_at=now() where id=p_id;
 else raise exception 'INVALID_ACTION'; end if;
end $$;

create or replace function public.list_projects(p_actor uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item order by item->>'createdAt' desc,item->>'id'),'[]'::jsonb) from (
 select jsonb_build_object('id',p.id,'name',p.name,'ownerId',p.owner_id,'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,
 'permission',case when p.owner_id=p_actor then 'owner' else mine.permission end,
 'members',coalesce((select jsonb_agg(jsonb_build_object('userId',person.user_id,'fullName',person.full_name,'email',person.account_email,
   'permission',member.permission,'hasAccess',exists(select 1 from public.project_access a where a.user_id=member.user_id)) order by member.permission='owner' desc,person.full_name,person.user_id)
   from (
    select p.owner_id as user_id,'owner'::text as permission
    union all select m.user_id,m.permission from public.project_members m where m.project_id=p.id and (p.owner_id=p_actor or m.permission<>'hidden')
   ) member join public.team_profiles person on person.user_id=member.user_id),'[]'::jsonb)) as item
 from public.projects p left join public.project_members mine on mine.project_id=p.id and mine.user_id=p_actor
 where exists(select 1 from public.project_access where user_id=p_actor)
 and (p.owner_id=p_actor or mine.permission in ('viewer','editor'))
 ) visible;
$$;
revoke all on function public.set_project_access(uuid,uuid,boolean),public.project_mutate(uuid,text,uuid,integer,jsonb),public.list_projects(uuid) from public,anon,authenticated;
grant execute on function public.set_project_access(uuid,uuid,boolean),public.project_mutate(uuid,text,uuid,integer,jsonb),public.list_projects(uuid) to service_role;

create or replace function public.search_project_people(p_actor uuid,p_query text)
returns setof public.team_profiles language sql stable security definer set search_path='' as $$
 select p.* from public.team_profiles p
 join public.project_access a on a.user_id=p.user_id
 where exists(select 1 from public.project_access where user_id=p_actor)
 and not p.is_hidden and p.user_id<>p_actor
 and not exists(select 1 from regexp_split_to_table(lower(btrim(p_query)),E'\\s+') token where token<>'' and strpos(lower(concat_ws(' ',p.full_name,p.account_email,p.work_email,p.telegram)),token)=0)
 order by coalesce(nullif(p.full_name,''),p.account_email),p.user_id limit 12;
$$;
revoke all on function public.search_project_people(uuid,text) from public,anon,authenticated;
grant execute on function public.search_project_people(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
