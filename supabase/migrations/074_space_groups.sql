begin;
create function public.space_append(p_actor uuid,p_project uuid,p_space uuid,p_objects jsonb,p_assets jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.project_spaces where id=p_space and project_id=p_project for update;
 if not found or coalesce(public.space_permission(p_actor,p_space),'') not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
 insert into public.project_space_objects(id,space_id,data) select (item->>'id')::uuid,p_space,item->'data' from jsonb_array_elements(p_objects) item;
 insert into public.project_space_assets(id,space_id,path,encrypted_data,created_by) select (item->>'id')::uuid,p_space,item->>'path',item->'encrypted_data',p_actor from jsonb_array_elements(p_assets) item;
end $$;
create function public.space_group(p_actor uuid,p_source uuid,p_target uuid,p_mode text,p_items jsonb,p_copies jsonb,p_assets jsonb) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; ids text[];
begin
 perform 1 from public.project_spaces where id in(p_source,p_target) order by id for update;
 if public.space_permission(p_actor,p_source) is null then raise exception 'ACCESS_DENIED';end if;
 if p_mode not in ('copy','move','delete') then raise exception 'INVALID_ACTION';end if;
 if p_mode in ('move','delete') and coalesce(public.space_permission(p_actor,p_source),'') not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
 if p_mode<>'delete' and (p_source=p_target or coalesce(public.space_permission(p_actor,p_target),'') not in ('owner','editor')) then raise exception 'ACCESS_DENIED';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  perform 1 from public.project_space_objects where id=(item->>'id')::uuid and space_id=p_source and revision=(item->>'revision')::integer for update;
  if not found then raise exception 'REVISION_CONFLICT';end if;
 end loop;
 if p_mode<>'delete' then
  insert into public.project_space_objects(id,space_id,data) select (v->>'id')::uuid,p_target,v->'data' from jsonb_array_elements(p_copies) v;
  insert into public.project_space_assets(id,space_id,path,encrypted_data,created_by) select (v->>'id')::uuid,p_target,v->>'path',v->'encrypted_data',p_actor from jsonb_array_elements(p_assets) v;
 end if;
 if p_mode in ('move','delete') then
  select array_agg(v->>'id') into ids from jsonb_array_elements(p_items) v;
  delete from public.project_space_objects where space_id=p_source and (id::text=any(ids) or (data->>'kind'='link' and (data->>'from'=any(ids) or data->>'to'=any(ids))));
 end if;
end $$;
revoke all on function public.space_append(uuid,uuid,uuid,jsonb,jsonb),public.space_group(uuid,uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.space_append(uuid,uuid,uuid,jsonb,jsonb),public.space_group(uuid,uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;
update public.account_home_layouts set layout=jsonb_set(layout,'{rows}',(layout->'rows')||jsonb_build_array(jsonb_build_object('align','center','cards',jsonb_build_array('spaces')))),revision=revision+1,updated_at=now() where not exists(select 1 from jsonb_array_elements(layout->'rows') r,jsonb_array_elements_text(r->'cards') c where c='spaces') and not (layout->'hidden') ? 'spaces';
commit;
