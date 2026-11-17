begin;
alter table public.projects add column profile jsonb not null default '{}'::jsonb;
alter table public.project_members add column kind text not null default 'executor' check(kind in ('executor','observer'));
create table public.project_folders(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,name text not null check(length(btrim(name)) between 1 and 120));
create table public.project_preferences(user_id uuid not null references auth.users(id) on delete cascade,project_id uuid not null references public.projects(id) on delete cascade,folder_id uuid references public.project_folders(id) on delete set null,favorite boolean not null default false,primary key(user_id,project_id));
alter table public.project_folders enable row level security;
alter table public.project_preferences enable row level security;
revoke all on public.project_folders,public.project_preferences from public,anon,authenticated;
grant all on public.project_folders,public.project_preferences to service_role;
create function public.project_permission(p_actor uuid,p_id uuid) returns text language sql stable security definer set search_path='' as $$
 select case when p.owner_id=p_actor then 'owner' else m.permission end from public.projects p left join public.project_members m on m.project_id=p.id and m.user_id=p_actor where p.id=p_id and exists(select 1 from public.project_access where user_id=p_actor) and (p.owner_id=p_actor or m.permission in ('viewer','editor'));
$$;
alter table public.kaban_boards add column project_id uuid references public.projects(id) on delete cascade;
alter function public.list_projects(uuid) rename to list_projects_v49;
create function public.list_projects(p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item || jsonb_build_object('profile',p.profile,'favorite',coalesce(pref.favorite,false),'folderId',pref.folder_id,
 'taskCount',(select count(distinct l.task_id) from public.kaban_task_locations l join public.kaban_boards b on b.id=l.board_id join public.kaban_tasks t on t.id=l.task_id where b.project_id=p.id and not t.archived),
 'members',(select coalesce(jsonb_agg(m || jsonb_build_object('kind',coalesce(pm.kind,'executor'),'roleIds',coalesce((select jsonb_agg(role_id) from public.team_role_assignments where user_id=(m->>'userId')::uuid),'[]'::jsonb))),'[]'::jsonb) from jsonb_array_elements(item->'members') m left join public.project_members pm on pm.project_id=p.id and pm.user_id=(m->>'userId')::uuid)) order by p.created_at desc),'[]'::jsonb)
 from jsonb_array_elements(public.list_projects_v49(p_actor)) item join public.projects p on p.id=(item->>'id')::uuid left join public.project_preferences pref on pref.project_id=p.id and pref.user_id=p_actor;
$$;
create function public.project_workspace_action(p_actor uuid,p_id uuid,p_revision integer,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; rights text; new_id uuid; folder uuid; target uuid;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED';end if;
 if p_action='folder' then
  insert into public.project_folders(user_id,name) values(p_actor,btrim(p_data->>'name')) returning id into new_id;
  return jsonb_build_object('id',new_id);
 end if;
 select * into p from public.projects where id=p_id for update;
 rights:=public.project_permission(p_actor,p_id);
 if rights is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if p_action in ('favorite','move') then
  folder:=nullif(p_data->>'folderId','')::uuid;
  if folder is not null and not exists(select 1 from public.project_folders where id=folder and user_id=p_actor) then raise exception 'ACCESS_DENIED';end if;
  insert into public.project_preferences(user_id,project_id) values(p_actor,p_id) on conflict do nothing;
  if p_action='favorite' then update public.project_preferences set favorite=(p_data->>'favorite')::boolean where project_id=p_id and user_id=p_actor;
  else update public.project_preferences set folder_id=folder where project_id=p_id and user_id=p_actor;end if;
  return '{}'::jsonb;
 end if;
 if p.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT';end if;
 if p_action='duplicate' then
  new_id:=gen_random_uuid();
  insert into public.projects(id,owner_id,name,profile) values(new_id,p_actor,left(p.name,110)||' — копия',p.profile - 'archived');
  insert into public.project_members(project_id,user_id,permission,kind)
   select new_id,user_id,permission,kind from public.project_members where project_id=p_id and user_id<>p_actor;
  if p.owner_id<>p_actor then insert into public.project_members(project_id,user_id,permission) values(new_id,p.owner_id,'editor');end if;
  return jsonb_build_object('id',new_id);
 end if;
 if p_action in ('delete','archive','kind') and rights<>'owner' then raise exception 'ACCESS_DENIED';end if;
 if p_action='delete' then delete from public.projects where id=p_id;return '{}'::jsonb;end if;
 if p_action='profile' then
  if rights not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
  target:=nullif(p_data->>'managerId','')::uuid;
  if target is not null and public.project_permission(target,p_id) is null then raise exception 'USER_NOT_ELIGIBLE';end if;
  update public.projects set profile=p_data, name=btrim(p_data->>'name'),revision=revision+1,updated_at=now() where id=p_id;
 elsif p_action='archive' then
  update public.projects set profile=jsonb_set(profile,'{archived}',p_data->'archived'),revision=revision+1,updated_at=now() where id=p_id;
 elsif p_action='kind' then
  update public.project_members set kind=p_data->>'kind' where project_id=p_id and user_id=(p_data->>'userId')::uuid;
  update public.projects set revision=revision+1,updated_at=now() where id=p_id;
 else raise exception 'INVALID_ACTION';end if;
 return '{}'::jsonb;
end $$;
-- Project boards coexist with legacy vault boards; no task is reassigned implicitly.
drop index public.kaban_personal_board;
create unique index kaban_personal_board on public.kaban_boards(owner_id) where vault_id is null and project_id is null;
create unique index kaban_project_board on public.kaban_boards(project_id) where project_id is not null;
alter table public.kaban_boards add constraint kaban_single_scope check(project_id is null or vault_id is null);
create or replace function public.kaban_check(p_actor uuid,p_board uuid,p_write boolean default false,p_manage boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.kaban_boards%rowtype; m public.shared_vault_members%rowtype; manager boolean; permission text;
begin
 select * into b from public.kaban_boards where id=p_board for update;
 if not found then raise exception 'KABAN_NOT_FOUND'; end if;
 if b.project_id is not null then
  perform 1 from public.projects where id=b.project_id for share;
  permission:=public.project_permission(p_actor,b.project_id);
  if permission is null or (p_write and permission='viewer') or (p_manage and permission<>'owner') then raise exception 'ACCESS_DENIED';end if;
  return jsonb_build_object('canEdit',permission in ('owner','editor'),'canManage',permission='owner','categoryIds',null);
 end if;
 if b.vault_id is null then
  if b.owner_id<>p_actor then raise exception 'ACCESS_DENIED'; end if;
  return jsonb_build_object('canEdit',true,'canManage',true,'categoryIds',null);
 end if;
 select * into m from public.shared_vault_members where vault_id=b.vault_id and user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 manager:=m.category_ids is null and (m.member_role='manager' or exists(select 1 from public.shared_vaults where id=b.vault_id and owner_id=p_actor));
 if (p_write and m.member_role='viewer') or (p_manage and not manager) then raise exception 'ACCESS_DENIED'; end if;
 return jsonb_build_object('canEdit',m.member_role<>'viewer','canManage',manager,'categoryIds',m.category_ids);
end $$;
create or replace function public.kaban_location_allowed(p_actor uuid,p_board uuid,p_categories text[],p_write boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kaban_boards b where b.id=p_board and
 ((b.project_id is not null and public.project_permission(p_actor,b.project_id) in ('owner','editor',case when not p_write then 'viewer' end)) or
 (b.project_id is null and ((b.vault_id is null and b.owner_id=p_actor) or exists(select 1 from public.shared_vault_members m where m.vault_id=b.vault_id and m.user_id=p_actor and (not p_write or m.member_role<>'viewer') and public.kaban_task_visible(b.id,p_categories,m.category_ids))))));
$$;
do $patch$ declare def text;begin
 select pg_get_functiondef('public.kaban_load_v41(uuid,uuid)'::regprocedure) into def;
 def:=replace(def,'vault_id is null and owner_id=p_actor','vault_id is null and project_id is null and owner_id=p_actor');
 execute def;
 -- The underlying task writer owns participant validation; project assignments use project membership.
 select pg_get_functiondef('public.kaban_task_mutate_v34(uuid,uuid,uuid,integer,jsonb,boolean)'::regprocedure) into def;
 def:=replace(def,'not (b.vault_id is null and u=p_actor)', 'not (b.project_id is not null and public.project_permission(u,b.project_id) is not null) and not (b.project_id is null and b.vault_id is null and u=p_actor)');
 execute def;
end $patch$;
create function public.kaban_project_load(p_actor uuid,p_project uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.kaban_boards%rowtype; rights jsonb; categories text[];
begin
 if public.project_permission(p_actor,p_project) is null then raise exception 'ACCESS_DENIED';end if;
 perform 1 from public.projects where id=p_project for share;
 insert into public.kaban_boards(owner_id,project_id) select owner_id,id from public.projects where id=p_project on conflict do nothing;
 select * into b from public.kaban_boards where project_id=p_project;
 rights:=public.kaban_check(p_actor,b.id);
 if jsonb_typeof(rights->'categoryIds')='array' then categories:=array(select jsonb_array_elements_text(rights->'categoryIds')); end if;
 return rights||jsonb_build_object('board',jsonb_build_object('id',b.id,'vaultId',b.vault_id,'projectId',b.project_id,'defaultStages',b.default_stages,'revision',b.revision,'stages',b.stages),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'parentId',parent_id,'color',color,'archived',archived,'revision',revision,'archiveRoot',archive_root,'legacyId',legacy_id,'stages',stages,'effectiveStages',public.kaban_category_stages(b.id,id))) from public.kaban_categories where board_id=b.id and public.kaban_category_visible(b.id,id,categories)),'[]'::jsonb),
 'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('board_id',l.board_id,'stage_id',l.stage_id,'category_stage_ids',l.category_stage_ids,'category_ids',l.category_ids,
 'file_count',(select count(*) from public.kaban_files where task_id=t.id),
 'locations',coalesce((select jsonb_agg(jsonb_build_object('boardId',x.board_id,'vaultId',xb.vault_id,'projectId',xb.project_id)) from public.kaban_task_locations x join public.kaban_boards xb on xb.id=x.board_id where x.task_id=t.id and public.kaban_location_allowed(p_actor,x.board_id,x.category_ids)),'[]'::jsonb)) order by t.created_at desc)
 from public.kaban_task_locations l join public.kaban_tasks t on t.id=l.task_id where l.board_id=b.id and public.kaban_task_visible(b.id,l.category_ids,categories)),'[]'::jsonb));
end $$;
create or replace function public.kaban_signal(p_board uuid,p_extra uuid default null) returns void language sql security definer set search_path='' as $$
 insert into public.kaban_live(user_id) select distinct u from (
 select b.owner_id u from public.kaban_boards b where b.id=p_board and b.vault_id is null
 union select m.user_id from public.kaban_boards b join public.shared_vault_members m on m.vault_id=b.vault_id where b.id=p_board
 union select m.user_id from public.kaban_boards b join public.project_members m on m.project_id=b.project_id where b.id=p_board and m.permission<>'hidden'
 union select p_extra where p_extra is not null) x where exists(select 1 from auth.users where id=u)
 on conflict(user_id) do update set token=gen_random_uuid();
$$;
revoke all on function public.project_permission(uuid,uuid),public.list_projects(uuid),public.project_workspace_action(uuid,uuid,integer,text,jsonb),public.kaban_project_load(uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_permission(uuid,uuid),public.list_projects(uuid),public.project_workspace_action(uuid,uuid,integer,text,jsonb),public.kaban_project_load(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
