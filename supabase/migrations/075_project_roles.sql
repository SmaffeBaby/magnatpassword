begin;

create table public.project_roles (
 project_id uuid not null references public.projects(id) on delete cascade,
 id text not null,
 name text not null check(length(btrim(name)) between 1 and 80),
 permission text not null check(permission in ('viewer','editor','hidden')),
 sections jsonb not null default '{}'::jsonb check(
  jsonb_typeof(sections)='object' and sections - array['documents','economy','tasks']='{}'::jsonb
  and (not (sections ? 'documents') or coalesce(sections->>'documents' in ('viewer','editor','hidden'),false))
  and (not (sections ? 'economy') or coalesce(sections->>'economy' in ('viewer','editor','hidden'),false))
  and (not (sections ? 'tasks') or coalesce(sections->>'tasks' in ('viewer','editor','hidden'),false))),
 primary key(project_id,id)
);
create unique index project_roles_name on public.project_roles(project_id,lower(name));
alter table public.project_roles enable row level security;
revoke all on public.project_roles from public,anon,authenticated;

alter table public.project_members add column role_id text,
 add foreign key(project_id,role_id) references public.project_roles(project_id,id);
create index project_members_role on public.project_members(project_id,role_id) where role_id is not null;

create function public.default_project_roles()
returns table(id text,name text,permission text) language sql immutable set search_path='' as $$
 values ('executor','Исполнитель','editor'), ('observer','Наблюдатель','viewer'), ('administrator','Администратор','editor');
$$;

insert into public.project_roles(project_id,id,name,permission)
 select p.id,r.id,r.name,r.permission from public.projects p cross join public.default_project_roles() r;

create function public.seed_project_roles() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.project_roles(project_id,id,name,permission)
  select new.id,r.id,r.name,r.permission from public.default_project_roles() r;
 return new;
end $$;
create trigger seed_project_roles after insert on public.projects
 for each row execute function public.seed_project_roles();

create function public.project_is_admin(p_actor uuid,p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_members m
  where m.project_id=p_id and m.user_id=p_actor and m.role_id='administrator' and m.permission='editor');
$$;

alter function public.project_mutate(uuid,text,uuid,integer,jsonb) rename to project_mutate_before_roles;
create function public.project_mutate(p_actor uuid,p_action text,p_id uuid,p_revision integer,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
 project public.projects%rowtype;
 role public.project_roles%rowtype;
 target uuid;
 role_key text;
 is_owner boolean;
begin
 if p_action not in ('member','remove_member','assign_role','save_role') then
  perform public.project_mutate_before_roles(p_actor,p_action,p_id,p_revision,p_payload);
  return;
 end if;

 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED';end if;
 select * into project from public.projects where id=p_id for update;
 if not found then raise exception 'PROJECT_NOT_FOUND';end if;
 is_owner:=project.owner_id=p_actor;
 if not is_owner and not public.project_is_admin(p_actor,p_id) then
  if public.project_permission(p_actor,p_id) is null then raise exception 'PROJECT_NOT_FOUND';end if;
  raise exception 'ACCESS_DENIED';
 end if;
 if project.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT';end if;

 if p_action='save_role' then
  role_key:=p_payload->>'id';
  if role_key is null then
   role_key:=gen_random_uuid()::text;
   insert into public.project_roles(project_id,id,name,permission,sections)
    values(p_id,role_key,btrim(p_payload->>'name'),p_payload->>'permission',p_payload->'sections');
  else
   if exists(select 1 from public.default_project_roles() where id=role_key) then raise exception 'ACCESS_DENIED';end if;
   update public.project_roles set name=btrim(p_payload->>'name'),permission=p_payload->>'permission',sections=p_payload->'sections'
    where project_id=p_id and id=role_key returning * into role;
   if not found then raise exception 'PROJECT_ROLE_NOT_FOUND';end if;
   update public.project_members set permission=role.permission,sections=role.sections
    where project_id=p_id and role_id=role_key;
   perform public.kaban_signal(b.id,m.user_id) from public.kaban_boards b
    join public.project_members m on m.project_id=b.project_id where b.project_id=p_id and m.role_id=role_key;
  end if;
 else
  target:=(p_payload->>'userId')::uuid;
  if target=project.owner_id then raise exception 'OWNER_REQUIRED';end if;
  if not is_owner and (target=p_actor or public.project_is_admin(target,p_id)) then raise exception 'ACCESS_DENIED';end if;

  if p_action='member' then
   if not is_owner then raise exception 'ACCESS_DENIED';end if;
   if exists(select 1 from public.project_members where project_id=p_id and user_id=target and role_id is not null) then
    raise exception 'PROJECT_ROLE_ASSIGNED';
   end if;
   perform public.project_mutate_before_roles(p_actor,p_action,p_id,p_revision,p_payload);
   return;
  elsif p_action='assign_role' then
   role_key:=p_payload->>'roleId';
   if not is_owner and role_key='administrator' then raise exception 'ACCESS_DENIED';end if;
   select * into role from public.project_roles where project_id=p_id and id=role_key;
   if not found then raise exception 'PROJECT_ROLE_NOT_FOUND';end if;
   if not exists(select 1 from public.project_access where user_id=target) then raise exception 'USER_NOT_ELIGIBLE';end if;
   insert into public.project_members(project_id,user_id,permission,sections,kind,role_id)
    values(p_id,target,role.permission,role.sections,case when role_key='observer' then 'observer' else 'executor' end,role_key)
    on conflict(project_id,user_id) do update set permission=excluded.permission,sections=excluded.sections,kind=excluded.kind,role_id=excluded.role_id;
  else
   delete from public.project_members where project_id=p_id and user_id=target;
  end if;
  perform public.kaban_signal(id,target) from public.kaban_boards where project_id=p_id;
 end if;
 update public.projects set revision=revision+1,updated_at=now() where id=p_id;
exception when unique_violation then
 if p_action='save_role' then raise exception 'PROJECT_ROLE_NAME_EXISTS';end if;
 raise;
end $$;

-- The original list hides inactive members from regular participants.
do $patch$
declare def text;
begin
 select pg_get_functiondef('public.list_projects_v49(uuid)'::regprocedure) into def;
 if strpos(def,'(p.owner_id=p_actor or m.permission<>''hidden'')')=0 then raise exception 'Unexpected member visibility';end if;
 execute replace(def,'(p.owner_id=p_actor or m.permission<>''hidden'')',
  '(p.owner_id=p_actor or public.project_is_admin(p_actor,p.id) or m.permission<>''hidden'')');
end $patch$;

alter function public.list_projects(uuid) rename to list_projects_before_roles;
create function public.list_projects(p_actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item || jsonb_build_object(
  'canManageMembers',p.owner_id=p_actor or public.project_is_admin(p_actor,p.id),
  'roles',(select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'permission',r.permission,'sections',r.sections)
    order by case r.id when 'executor' then 0 when 'observer' then 1 when 'administrator' then 2 else 3 end,lower(r.name),r.id)
    from public.project_roles r where r.project_id=p.id),
  'members',(select jsonb_agg(m || jsonb_build_object('projectRoleId',pm.role_id) order by position)
    from jsonb_array_elements(item->'members') with ordinality as member(m,position)
    left join public.project_members pm on pm.project_id=p.id and pm.user_id=(m->>'userId')::uuid)
 ) order by item_position),'[]'::jsonb)
 from jsonb_array_elements(public.list_projects_before_roles(p_actor)) with ordinality as projects(item,item_position)
 join public.projects p on p.id=(item->>'id')::uuid;
$$;

alter function public.project_workspace_action(uuid,uuid,integer,text,jsonb) rename to project_workspace_before_roles;
create function public.project_workspace_action(p_actor uuid,p_id uuid,p_revision integer,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; target_project uuid;
begin
 result:=public.project_workspace_before_roles(p_actor,p_id,p_revision,p_action,p_data);
 if p_action='kind' and exists(select 1 from public.project_members
    where project_id=p_id and user_id=(p_data->>'userId')::uuid and role_id is not null) then
  raise exception 'PROJECT_ROLE_ASSIGNED';
 end if;
 if p_action='duplicate' then
  target_project:=(result->>'id')::uuid;
  insert into public.project_roles(project_id,id,name,permission,sections)
   select target_project,id,name,permission,sections from public.project_roles where project_id=p_id
   on conflict(project_id,id) do nothing;
  update public.project_members copy set role_id=source.role_id from public.project_members source
   where copy.project_id=target_project and source.project_id=p_id and copy.user_id=source.user_id;
 end if;
 return result;
end $$;

create function public.project_member_candidates(p_actor uuid,p_id uuid,p_query text,p_offset integer)
returns setof public.team_profiles language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.project_access where user_id=p_actor)
  or not exists(select 1 from public.projects p where p.id=p_id and (p.owner_id=p_actor or public.project_is_admin(p_actor,p_id))) then
  raise exception 'ACCESS_DENIED';
 end if;
 return query select p.* from public.team_profiles p join public.project_access a on a.user_id=p.user_id
  where not p.is_hidden and p.user_id<>(select owner_id from public.projects where id=p_id)
  and not exists(select 1 from public.project_members m where m.project_id=p_id and m.user_id=p.user_id)
  and not exists(select 1 from regexp_split_to_table(lower(btrim(p_query)),'[[:space:]]+') token
   where token<>'' and strpos(lower(concat_ws(' ',p.full_name,p.account_email,p.work_email,p.telegram)),token)=0)
  order by coalesce(nullif(p.full_name,''),p.account_email),p.user_id offset p_offset limit 31;
end $$;

revoke all on function public.default_project_roles(),public.seed_project_roles(),public.project_is_admin(uuid,uuid),
 public.project_mutate_before_roles(uuid,text,uuid,integer,jsonb),public.list_projects_before_roles(uuid),
 public.project_workspace_before_roles(uuid,uuid,integer,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.project_mutate(uuid,text,uuid,integer,jsonb),public.list_projects(uuid),
 public.project_workspace_action(uuid,uuid,integer,text,jsonb),public.project_member_candidates(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.project_mutate(uuid,text,uuid,integer,jsonb),public.list_projects(uuid),
 public.project_workspace_action(uuid,uuid,integer,text,jsonb),public.project_member_candidates(uuid,uuid,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
