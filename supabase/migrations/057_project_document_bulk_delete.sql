begin;
-- A delete plan is permission-checked against every descendant, including hidden files.
-- Its token binds confirmation to the exact tree and revisions the user previewed.
create function public.project_document_folder_delete_plan(p_actor uuid,p_project uuid,p_folder uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; files jsonb; folders jsonb;
begin
 perform 1 from public.projects where id=p_project for share;
 if public.project_section_permission(p_actor,p_project,'documents') is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if public.project_section_permission(p_actor,p_project,'documents') not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
 if not exists(select 1 from public.project_document_folders where id=p_folder and project_id=p_project) then raise exception 'FOLDER_NOT_FOUND';end if;
 with recursive tree as (
  select id from public.project_document_folders where id=p_folder and project_id=p_project
  union all select f.id from public.project_document_folders f join tree t on f.parent_id=t.id where f.project_id=p_project
 ) select array_agg(id) into ids from tree;
 if exists(select 1 from public.project_documents d where d.project_id=p_project and d.folder_id=any(ids) and coalesce(public.project_document_permission(p_actor,d.id),'hidden') not in ('owner','editor')) then raise exception 'ACCESS_DENIED';end if;
 select coalesce(jsonb_agg(jsonb_build_array(id,revision,folder_id) order by id),'[]') into files from public.project_documents where project_id=p_project and folder_id=any(ids);
 select jsonb_agg(jsonb_build_array(id,revision,parent_id) order by id) into folders from public.project_document_folders where project_id=p_project and id=any(ids);
 return jsonb_build_object('filesCount',jsonb_array_length(files),'foldersCount',jsonb_array_length(folders),'token',md5(jsonb_build_array(folders,files)::text));
end $$;

alter function public.project_document_folder_mutate(uuid,uuid,uuid,integer,text,jsonb) rename to project_document_folder_mutate_v56;
create function public.project_document_folder_mutate(p_actor uuid,p_project uuid,p_folder uuid,p_revision integer,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan jsonb; ids uuid[]; current_revision integer;
begin
 if p_action<>'delete-tree' then return public.project_document_folder_mutate_v56(p_actor,p_project,p_folder,p_revision,p_action,p_data);end if;
 perform 1 from public.projects where id=p_project for update;
 plan:=public.project_document_folder_delete_plan(p_actor,p_project,p_folder);
 select revision into current_revision from public.project_document_folders where id=p_folder and project_id=p_project;
 if current_revision is distinct from p_revision or plan->>'token' is distinct from p_data->>'token' then raise exception 'REVISION_CONFLICT';end if;
 with recursive tree as (
  select id from public.project_document_folders where id=p_folder and project_id=p_project
  union all select f.id from public.project_document_folders f join tree t on f.parent_id=t.id where f.project_id=p_project
 ) select array_agg(id) into ids from tree;
 delete from public.project_documents where project_id=p_project and folder_id=any(ids);
 delete from public.project_document_folders where project_id=p_project and id=any(ids);
 return plan - 'token';
end $$;

create function public.project_documents_delete(p_actor uuid,p_project uuid,p_files jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb; d public.project_documents%rowtype; rights text;
begin
 perform 1 from public.projects where id=p_project for update;
 if public.project_section_permission(p_actor,p_project,'documents') is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files) not between 1 and 500 then raise exception 'INVALID_FILE';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_files))<>jsonb_array_length(p_files) then raise exception 'INVALID_FILE';end if;
 -- Validate the complete selection before deleting anything.
 for item in select value from jsonb_array_elements(p_files) loop
  select * into d from public.project_documents where id=(item->>'id')::uuid and project_id=p_project;
  rights:=public.project_document_permission(p_actor,d.id);
  if not found or rights is null then raise exception 'FILE_NOT_FOUND';end if;
  if rights not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
  if d.revision is distinct from (item->>'revision')::integer then raise exception 'REVISION_CONFLICT';end if;
 end loop;
 for item in select value from jsonb_array_elements(p_files) loop
  delete from public.project_documents where id=(item->>'id')::uuid and project_id=p_project;
 end loop;
 return jsonb_build_object('deleted',jsonb_array_length(p_files));
end $$;
revoke all on function public.project_document_folder_delete_plan(uuid,uuid,uuid),public.project_document_folder_mutate(uuid,uuid,uuid,integer,text,jsonb),public.project_documents_delete(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.project_document_folder_delete_plan(uuid,uuid,uuid),public.project_document_folder_mutate(uuid,uuid,uuid,integer,text,jsonb),public.project_documents_delete(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
