begin;
create or replace function public.project_company_migrate(p_actor uuid,p_project uuid,p_records jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.projects%rowtype; item jsonb; selected_id uuid;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_project for update;
 if not found or not (project.owner_id=p_actor or exists(select 1 from public.project_members where project_id=p_project and user_id=p_actor and permission in ('viewer','editor'))) then raise exception 'PROJECT_NOT_FOUND'; end if;
 if not project.counterparties_migrated and p_records is not null then
  for item in select value from jsonb_array_elements(p_records) order by value->>'identityHash' loop
   insert into public.project_companies(id,owner_id,identity_hash,encrypted_data) values((item->>'id')::uuid,project.owner_id,item->>'identityHash',item->'encryptedData') on conflict(owner_id,identity_hash) do nothing;
   select id into selected_id from public.project_companies where owner_id=project.owner_id and identity_hash=item->>'identityHash';
   insert into public.project_company_links(project_id,local_id,catalog_id) values(p_project,(item->>'localId')::uuid,selected_id) on conflict(project_id,local_id) do nothing;
  end loop;
  update public.projects set counterparties_migrated=true where id=p_project;
  project.counterparties_migrated:=true;
 end if;
 -- Own legal entities are available automatically, including in existing projects.
 -- Links live outside the encrypted estimate; preserving local IDs keeps old references valid.
 if project.counterparties_migrated then
 insert into public.project_company_links(project_id,local_id,catalog_id)
 select p_project,c.id,c.id from public.project_companies c
 where c.is_own_legal_entity and not exists(
  select 1 from public.project_company_links l where l.project_id=p_project and l.catalog_id=c.id
 ) on conflict(project_id,local_id) do nothing;
 end if;
 return jsonb_build_object('migrated',project.counterparties_migrated,'records',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'localId',l.local_id,'encryptedData',c.encrypted_data,'isOwnLegalEntity',c.is_own_legal_entity)) from public.project_company_links l join public.project_companies c on c.id=l.catalog_id where l.project_id=p_project),'[]'::jsonb));
end $$;

revoke all on function public.project_company_migrate(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.project_company_migrate(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
