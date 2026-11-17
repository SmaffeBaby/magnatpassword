begin;
-- Validate every selected tree before deleting anything; remove unions so overlapping
-- folders or explicitly selected descendant files are deleted and counted once.
create function public.project_document_selection_delete(p_actor uuid,p_project uuid,p_files jsonb,p_folders jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb; plan jsonb; revision integer; ids uuid[]; files_count integer:=0; tree_files integer:=0; folders_count integer:=0;
begin
 perform 1 from public.projects where id=p_project for update;
 if public.project_section_permission(p_actor,p_project,'documents') is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if jsonb_typeof(p_files) is distinct from 'array' or jsonb_typeof(p_folders) is distinct from 'array' then raise exception 'INVALID_FILE';end if;
 if jsonb_array_length(p_files)>500 or jsonb_array_length(p_folders)>500 or jsonb_array_length(p_files)+jsonb_array_length(p_folders)=0 then raise exception 'INVALID_FILE';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_folders))<>jsonb_array_length(p_folders) then raise exception 'INVALID_FILE';end if;
 for item in select value from jsonb_array_elements(p_folders) loop
  plan:=public.project_document_folder_delete_plan(p_actor,p_project,(item->>'id')::uuid);
  select f.revision into revision from public.project_document_folders f where f.id=(item->>'id')::uuid and f.project_id=p_project;
  if revision is distinct from (item->>'revision')::integer or plan->>'token' is distinct from item->>'token' then raise exception 'REVISION_CONFLICT';end if;
 end loop;
 with recursive tree as (
  select id from public.project_document_folders where project_id=p_project and id in (select (value->>'id')::uuid from jsonb_array_elements(p_folders))
  union select f.id from public.project_document_folders f join tree t on f.parent_id=t.id where f.project_id=p_project
 ) select array_agg(id) into ids from tree;
 if jsonb_array_length(p_files)>0 then
  plan:=public.project_documents_delete(p_actor,p_project,p_files);
  files_count:=(plan->>'deleted')::integer;
 end if;
 delete from public.project_documents where project_id=p_project and folder_id=any(ids);
 get diagnostics tree_files=row_count;
 delete from public.project_document_folders where project_id=p_project and id=any(ids);
 get diagnostics folders_count=row_count;
 return jsonb_build_object('deleted',files_count+tree_files,'deletedFolders',folders_count);
end $$;
revoke all on function public.project_document_selection_delete(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.project_document_selection_delete(uuid,uuid,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
