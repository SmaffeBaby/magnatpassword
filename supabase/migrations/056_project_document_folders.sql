begin;
create table public.project_document_folders(
 id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
 parent_id uuid, encrypted_data jsonb not null, name_key text not null,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,id), unique nulls not distinct(project_id,parent_id,name_key),
 foreign key(project_id,parent_id) references public.project_document_folders(project_id,id)
);
alter table public.project_document_folders enable row level security;
revoke all on public.project_document_folders from public,anon,authenticated;
grant all on public.project_document_folders to service_role;
alter table public.project_documents add column folder_id uuid;
alter table public.project_documents add foreign key(project_id,folder_id) references public.project_document_folders(project_id,id);
create index project_documents_folder on public.project_documents(project_id,folder_id);

create function public.project_document_folder_check(p_project uuid,p_folder uuid) returns void
language plpgsql security definer set search_path='' as $$
declare parent uuid:=p_folder; depth integer:=0;
begin
 while parent is not null loop
  depth:=depth+1;
  if depth>20 then raise exception 'FOLDER_DEPTH';end if;
  select f.parent_id into parent from public.project_document_folders f where f.id=parent and f.project_id=p_project;
  if not found then raise exception 'FOLDER_NOT_FOUND';end if;
 end loop;
end $$;
create function public.project_document_folders_read(p_actor uuid,p_project uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project for share;
 if public.project_section_permission(p_actor,p_project,'documents') is null then raise exception 'PROJECT_NOT_FOUND';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'parentId',parent_id,'encryptedData',encrypted_data,'revision',revision)) from public.project_document_folders where project_id=p_project),'[]');
end $$;
create function public.project_document_folder_mutate(p_actor uuid,p_project uuid,p_folder uuid,p_revision integer,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare parent uuid:=(p_data->>'parentId')::uuid; current_revision integer;
begin
 perform 1 from public.projects where id=p_project for update;
 if public.project_section_permission(p_actor,p_project,'documents') is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if public.project_section_permission(p_actor,p_project,'documents') not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
 if p_action='create' then
  if p_revision is distinct from 0 then raise exception 'REVISION_CONFLICT';end if;
  if (select count(*) from public.project_document_folders where project_id=p_project)>=500 then raise exception 'FOLDER_LIMIT';end if;
  perform public.project_document_folder_check(p_project,parent);
  -- Check the new depth as well, before writing the tree.
  if parent is not null then
   with recursive ancestors as (
    select id,parent_id,1 depth from public.project_document_folders where id=parent and project_id=p_project
    union all select f.id,f.parent_id,a.depth+1 from public.project_document_folders f join ancestors a on f.id=a.parent_id
   ) select max(depth) into current_revision from ancestors;
   if current_revision>=20 then raise exception 'FOLDER_DEPTH';end if;
  end if;
  insert into public.project_document_folders(id,project_id,parent_id,encrypted_data,name_key) values(p_folder,p_project,parent,p_data->'encryptedData',p_data->>'nameKey');
 else
  select revision into current_revision from public.project_document_folders where id=p_folder and project_id=p_project;
  if not found then raise exception 'FOLDER_NOT_FOUND';end if;
  if current_revision is distinct from p_revision then raise exception 'REVISION_CONFLICT';end if;
  if p_action='delete' then
   -- Includes invisible files: never silently delete another participant's files.
   if exists(select 1 from public.project_documents where folder_id=p_folder) or exists(select 1 from public.project_document_folders where parent_id=p_folder) then raise exception 'FOLDER_NOT_EMPTY';end if;
   delete from public.project_document_folders where id=p_folder;
  elsif p_action='rename' then
   update public.project_document_folders set encrypted_data=p_data->'encryptedData',name_key=p_data->>'nameKey',revision=revision+1,updated_at=now() where id=p_folder;
  else raise exception 'INVALID_ACTION';end if;
 end if;
 return jsonb_build_object('id',p_folder);
exception when unique_violation then raise exception 'FOLDER_EXISTS';
end $$;

alter function public.project_documents_read(uuid,uuid,uuid) rename to project_documents_read_v55;
create function public.project_documents_read(p_actor uuid,p_project uuid,p_file uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.project_documents_read_v55(p_actor,p_project,p_file);
 return coalesce((select jsonb_agg(item||jsonb_build_object('folderId',d.folder_id)) from jsonb_array_elements(result) item join public.project_documents d on d.id=(item->>'id')::uuid),'[]');
end $$;
alter function public.project_document_mutate(uuid,uuid,uuid,integer,text,jsonb) rename to project_document_mutate_v55;
create function public.project_document_mutate(p_actor uuid,p_project uuid,p_file uuid,p_revision integer,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; source public.project_documents%rowtype; target_folder uuid:=(p_data->>'folderId')::uuid;
begin
 perform 1 from public.projects where id=p_project for update;
 if public.project_section_permission(p_actor,p_project,'documents') is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if p_action in ('create','move') then perform public.project_document_folder_check(p_project,target_folder);end if;
 if p_action='move' then
  select * into source from public.project_documents where id=p_file and project_id=p_project;
  if not found or public.project_document_permission(p_actor,p_file) is null then raise exception 'FILE_NOT_FOUND';end if;
  if public.project_document_permission(p_actor,p_file) not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
  if source.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT';end if;
  update public.project_documents set folder_id=target_folder,revision=revision+1,updated_at=now() where id=p_file;
  return jsonb_build_object('ok',true);
 end if;
 if p_action='create' and p_data ? 'sourceId' then
  select * into source from public.project_documents where id=(p_data->>'sourceId')::uuid and project_id=p_project;
  if not found or public.project_document_permission(p_actor,source.id) is null then raise exception 'FILE_NOT_FOUND';end if;
  if source.revision is distinct from (p_data->>'sourceRevision')::integer then raise exception 'REVISION_CONFLICT';end if;
 end if;
 result:=public.project_document_mutate_v55(p_actor,p_project,p_file,p_revision,p_action,p_data);
 if p_action='create' then
  update public.project_documents set folder_id=target_folder where id=p_file;
  if source.id is not null then
   -- Copy ACLs atomically, including grants hidden from the copying participant.
   update public.project_documents set default_permission=source.default_permission where id=p_file;
   insert into public.project_document_members(project_id,document_id,user_id,permission)
    select project_id,p_file,user_id,permission from public.project_document_members where document_id=source.id;
  end if;
 end if;
 return result;
end $$;
create function public.project_document_import(p_actor uuid,p_project uuid,p_folders jsonb,p_files jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb;
begin
 perform 1 from public.projects where id=p_project for update;
 if public.project_section_permission(p_actor,p_project,'documents') is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if public.project_section_permission(p_actor,p_project,'documents') not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
 for item in select value from jsonb_array_elements(p_folders) loop
  perform public.project_document_folder_mutate(p_actor,p_project,(item->>'id')::uuid,0,'create',item);
 end loop;
 for item in select value from jsonb_array_elements(p_files) loop
  perform public.project_document_mutate(p_actor,p_project,(item->>'id')::uuid,0,'create',item);
 end loop;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.project_document_folder_check(uuid,uuid),public.project_document_folders_read(uuid,uuid),public.project_document_folder_mutate(uuid,uuid,uuid,integer,text,jsonb),public.project_documents_read(uuid,uuid,uuid),public.project_document_mutate(uuid,uuid,uuid,integer,text,jsonb),public.project_document_import(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.project_document_folders_read(uuid,uuid),public.project_document_folder_mutate(uuid,uuid,uuid,integer,text,jsonb),public.project_documents_read(uuid,uuid,uuid),public.project_document_mutate(uuid,uuid,uuid,integer,text,jsonb),public.project_document_import(uuid,uuid,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
