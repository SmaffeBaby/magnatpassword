begin;
create function public.space_import(p_actor uuid,p_project uuid,p_space uuid,p_name text,p_description text,p_objects jsonb,p_assets jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(public.project_permission(p_actor,p_project),'') not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
 insert into public.project_spaces(id,project_id,name,description,created_by) values(p_space,p_project,p_name,p_description,p_actor);
 insert into public.project_space_objects(id,space_id,data) select (item->>'id')::uuid,p_space,item->'data' from jsonb_array_elements(p_objects) item;
 insert into public.project_space_assets(id,space_id,path,encrypted_data,created_by) select (item->>'id')::uuid,p_space,item->>'path',item->'encrypted_data',p_actor from jsonb_array_elements(p_assets) item;
end $$;
revoke all on function public.space_import(uuid,uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.space_import(uuid,uuid,uuid,text,text,jsonb,jsonb) to service_role;
commit;
