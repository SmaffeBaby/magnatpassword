begin;
-- Contract attachments use RESTRICT on their contract reference. Remove them inside
-- the same owner-authorized transaction before cascading the project deletion.
do $patch$ declare def text;begin
 select pg_get_functiondef('public.project_workspace_action(uuid,uuid,integer,text,jsonb)'::regprocedure) into def;
 if strpos(def,'if p_action=''delete'' then delete from public.projects')=0 then raise exception 'Unexpected project delete definition';end if;
 def:=replace(def,'if p_action=''delete'' then delete from public.projects', 'if p_action=''delete'' then delete from public.project_contract_files where project_id=p_id; delete from public.project_execution_contracts where project_id=p_id; delete from public.project_closing_contracts where project_id=p_id; delete from public.projects');
 execute def;
end $patch$;
notify pgrst,'reload schema';
commit;
