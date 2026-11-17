begin;
-- Extend customized home layouts without resetting users' existing rows or hidden cards.
update public.account_home_layouts set layout=jsonb_set(layout,'{rows}',(layout->'rows')||jsonb_build_array(jsonb_build_object('align','center','cards',jsonb_build_array('wordcraft','pdfcraft','gridcraft','deckcraft','photocraft')))),revision=revision+1,updated_at=now();
create function public.office_attachment_replace(p_actor uuid,p_kind text,p_project uuid,p_record uuid,p_file uuid,p_expected jsonb,p_new_file uuid,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare current_data jsonb;
begin
 if p_kind='task' then
  perform public.kaban_files_access(p_actor,p_record,true);
  select encrypted_data into current_data from public.kaban_files where id=p_file and task_id=p_record for update;
 elsif p_kind='contract' then
  perform public.project_contract_files_access(p_actor,p_project,p_record,true);
  select encrypted_data into current_data from public.project_contract_files where id=p_file and project_id=p_project and contract_id=p_record for update;
 elsif p_kind='registry' then
  perform public.registry_contract_files_access(p_actor,'standalone',p_record,true);
  select encrypted_data into current_data from public.registry_contract_files where id=p_file and contract_id=p_record for update;
 else raise exception 'INVALID_FILE';end if;
 if current_data is null then raise exception 'FILE_NOT_FOUND';end if;
 if current_data is distinct from p_expected then raise exception 'REVISION_CONFLICT';end if;
 if p_kind='task' then
  perform public.kaban_files_access(p_actor,p_record,true,p_file,null,true);
  perform public.kaban_files_access(p_actor,p_record,true,p_new_file,p_data);
 elsif p_kind='contract' then
  perform public.project_contract_files_access(p_actor,p_project,p_record,true,p_file,null,true);
  perform public.project_contract_files_access(p_actor,p_project,p_record,true,p_new_file,p_data);
 else
  perform public.registry_contract_files_access(p_actor,'standalone',p_record,true,p_file,null,true);
  perform public.registry_contract_files_access(p_actor,'standalone',p_record,true,p_new_file,p_data);
 end if;
end $$;
revoke all on function public.office_attachment_replace(uuid,text,uuid,uuid,uuid,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.office_attachment_replace(uuid,text,uuid,uuid,uuid,jsonb,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
