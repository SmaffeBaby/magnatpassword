begin;
-- Keep the legacy eligibility table populated for old RPCs, but enrollment is now
-- automatic for every account, including future registrations.
create function public.enroll_project_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.project_access(user_id) values(new.user_id) on conflict do nothing;
 return new;
end $$;
revoke all on function public.enroll_project_user() from public,anon,authenticated;
create trigger enroll_project_user after insert on public.team_profiles
 for each row execute function public.enroll_project_user();
insert into public.project_access(user_id) select user_id from public.team_profiles on conflict do nothing;

create or replace function public.set_project_access(p_actor uuid,p_user uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.site_admins where user_id=p_actor) then raise exception 'ACCESS_DENIED';end if;
 if not p_enabled then raise exception 'GLOBAL_ACCESS_REQUIRED';end if;
 if not exists(select 1 from public.team_profiles where user_id=p_user) then raise exception 'USER_NOT_FOUND';end if;
 insert into public.project_access(user_id) values(p_user) on conflict do nothing;
end $$;

alter table public.project_members add column sections jsonb not null default '{}'::jsonb
 check(jsonb_typeof(sections)='object' and sections - array['economy','tasks'] = '{}'::jsonb
 and (not (sections ? 'economy') or coalesce(sections->>'economy' in ('hidden','viewer','editor'),false))
 and (not (sections ? 'tasks') or coalesce(sections->>'tasks' in ('hidden','viewer','editor'),false)));

-- A hidden/removed project membership always takes precedence over section grants.
-- Missing overrides inherit the member's existing permission, preserving old projects.
create function public.project_section_permission(p_actor uuid,p_id uuid,p_section text)
returns text language sql stable security definer set search_path='' as $$
 select case when p.owner_id=p_actor then 'owner'
 else nullif(coalesce(m.sections->>p_section,m.permission),'hidden') end
 from public.projects p left join public.project_members m on m.project_id=p.id and m.user_id=p_actor
 where p.id=p_id and p_section in ('economy','tasks') and (p.owner_id=p_actor or m.permission in ('viewer','editor'));
$$;
revoke all on function public.project_section_permission(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.project_section_permission(uuid,uuid,text) to service_role;

create or replace function public.project_mutate(p_actor uuid,p_action text,p_id uuid,p_revision integer,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 -- The original mutation checks ownership and revision under the project row lock.
 perform public.project_mutate_v49(p_actor,p_action,p_id,p_revision,p_payload);
 if p_action='member' then
  if p_payload ? 'kind' then
   if p_payload->>'kind' not in ('executor','observer') then raise exception 'INVALID_PERMISSION';end if;
   update public.project_members set kind=p_payload->>'kind' where project_id=p_id and user_id=(p_payload->>'userId')::uuid;
  end if;
  if p_payload ? 'sections' then
   update public.project_members set sections=p_payload->'sections' where project_id=p_id and user_id=(p_payload->>'userId')::uuid;
  end if;
  -- Refresh open boards when the owner's changes commit.
  perform public.kaban_signal(id,(p_payload->>'userId')::uuid) from public.kaban_boards where project_id=p_id;
 elsif p_action='remove_member' then
  perform public.kaban_signal(id,(p_payload->>'userId')::uuid) from public.kaban_boards where project_id=p_id;
 end if;
end $$;


CREATE OR REPLACE FUNCTION public.project_estimate(p_actor uuid, p_id uuid, p_revision integer DEFAULT NULL::integer, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects%rowtype; permission text; estimate public.project_estimates%rowtype;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 -- Serialize with membership changes and project deletion as well as concurrent estimate writes.
 select * into project from public.projects where id=p_id for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 permission:=public.project_section_permission(p_actor,p_id,'economy');
 if permission is null or permission='hidden' then raise exception 'PROJECT_NOT_FOUND'; end if;
 select * into estimate from public.project_estimates where project_id=p_id;
 if p_data is not null then
  if permission not in ('owner','editor') then raise exception 'ACCESS_DENIED'; end if;
  if coalesce(estimate.revision,0) is distinct from p_revision then raise exception 'REVISION_CONFLICT'; end if;
  insert into public.project_estimates(project_id,encrypted_data) values(p_id,p_data)
   on conflict(project_id) do update set encrypted_data=excluded.encrypted_data,revision=project_estimates.revision+1,updated_at=now()
   returning * into estimate;
 end if;
 return jsonb_build_object('revision',coalesce(estimate.revision,0),'encryptedData',estimate.encrypted_data,'updatedAt',estimate.updated_at,'projectName',project.name);
end $function$;

CREATE OR REPLACE FUNCTION public.project_input_data(p_actor uuid, p_id uuid, p_revision integer DEFAULT NULL::integer, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects%rowtype; permission text; estimate public.project_inputs%rowtype;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 -- Serialize with membership changes and project deletion as well as concurrent estimate writes.
 select * into project from public.projects where id=p_id for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 permission:=public.project_section_permission(p_actor,p_id,'economy');
 if permission is null or permission='hidden' then raise exception 'PROJECT_NOT_FOUND'; end if;
 select * into estimate from public.project_inputs where project_id=p_id;
 if p_data is not null then
  if permission not in ('owner','editor') then raise exception 'ACCESS_DENIED'; end if;
  if coalesce(estimate.revision,0) is distinct from p_revision then raise exception 'REVISION_CONFLICT'; end if;
  insert into public.project_inputs(project_id,encrypted_data) values(p_id,p_data)
   on conflict(project_id) do update set encrypted_data=excluded.encrypted_data,revision=project_inputs.revision+1,updated_at=now()
   returning * into estimate;
 end if;
 return jsonb_build_object('revision',coalesce(estimate.revision,0),'encryptedData',estimate.encrypted_data,'updatedAt',estimate.updated_at,'projectName',project.name);
end $function$;

CREATE OR REPLACE FUNCTION public.project_dashboard(p_actor uuid, p_id uuid, p_revision integer DEFAULT NULL::integer, p_layout jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects%rowtype; permission text; prefs public.project_dashboard_preferences%rowtype;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_id for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 permission:=public.project_section_permission(p_actor,p_id,'economy');
 if permission is null or permission='hidden' then raise exception 'PROJECT_NOT_FOUND'; end if;
 select * into prefs from public.project_dashboard_preferences where project_id=p_id and user_id=p_actor;
 if p_layout is not null then
  if coalesce(prefs.revision,0) is distinct from p_revision then raise exception 'REVISION_CONFLICT'; end if;
  insert into public.project_dashboard_preferences(project_id,user_id,layout) values(p_id,p_actor,p_layout)
   on conflict(project_id,user_id) do update set layout=excluded.layout,revision=project_dashboard_preferences.revision+1
   returning * into prefs;
 end if;
 return jsonb_build_object('revision',coalesce(prefs.revision,0),'layout',prefs.layout);
end $function$;

CREATE OR REPLACE FUNCTION public.project_contract_files_access(p_actor uuid, p_project uuid, p_contract uuid, p_write boolean DEFAULT false, p_file uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT NULL::jsonb, p_delete boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects%rowtype; permission text;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_project for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 permission:=public.project_section_permission(p_actor,p_project,'economy');
 if permission is null or permission='hidden' then raise exception 'PROJECT_NOT_FOUND'; end if;
 if (p_write or p_file is not null) and permission not in ('owner','editor') then raise exception 'ACCESS_DENIED'; end if;
 if not exists(select 1 from public.project_contracts where id=p_contract and project_id=p_project) then raise exception 'PROJECT_NOT_FOUND'; end if;
 if p_file is not null then
  if p_delete then
   delete from public.project_contract_files where id=p_file and project_id=p_project and contract_id=p_contract;
   if not found then raise exception 'FILE_NOT_FOUND'; end if;
  else
   if p_data is null then raise exception 'INVALID_FILE'; end if;
   if (select count(*) from public.project_contract_files where project_id=p_project and contract_id=p_contract)>=20 then raise exception 'FILE_LIMIT'; end if;
   insert into public.project_contract_files(id,project_id,contract_id,encrypted_data) values(p_file,p_project,p_contract,p_data);
  end if;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'encryptedData',encrypted_data) order by id) from public.project_contract_files where project_id=p_project and contract_id=p_contract),'[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.project_contract_list(p_actor uuid, p_project uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.project_access where user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 if not exists(select 1 from public.projects p where p.id=p_project and (p.owner_id=p_actor or (public.project_section_permission(p_actor,p.id,'economy') is not null))) then raise exception 'PROJECT_NOT_FOUND'; end if;
 return jsonb_build_object('estimateRevision',coalesce((select revision from public.project_estimates where project_id=p_project),0),'contracts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'encryptedData',encrypted_data,'fileCount',(select count(*) from public.project_contract_files f where f.project_id=p_project and f.contract_id=project_contracts.id)) order by id) from public.project_contracts where project_id=p_project),'[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.project_contract_mutate(p_actor uuid, p_project uuid, p_id uuid, p_revision integer, p_estimate_revision integer, p_seller uuid, p_buyer uuid, p_source text, p_items jsonb, p_data jsonb, p_delete boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects%rowtype; existing public.project_contracts%rowtype; estimate_revision integer; own_count integer;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 -- Serialize party classification with contract writes, before acquiring company locks.
 perform pg_catalog.pg_advisory_xact_lock(172914,1);
 select * into project from public.projects where id=p_project for update;
 if not found or (project.owner_id<>p_actor and not (public.project_section_permission(p_actor,p_project,'economy') is not null)) then raise exception 'PROJECT_NOT_FOUND'; end if;
 if project.owner_id<>p_actor and not (public.project_section_permission(p_actor,p_project,'economy') in ('owner','editor')) then raise exception 'ACCESS_DENIED'; end if;
 select revision into estimate_revision from public.project_estimates where project_id=p_project;
 if coalesce(estimate_revision,0)<>p_estimate_revision then raise exception 'REVISION_CONFLICT'; end if;
 select * into existing from public.project_contracts where id=p_id and project_id=p_project;
 if p_revision=0 and existing.id is not null then raise exception 'REVISION_CONFLICT'; end if;
 if p_revision>0 and (existing.id is null or existing.revision<>p_revision) then raise exception 'REVISION_CONFLICT'; end if;
 if p_delete then
  delete from public.project_contracts where id=p_id and project_id=p_project;
 else
  if p_seller=p_buyer then raise exception 'CONTRACT_SAME_PARTY'; end if;
  perform 1 from public.project_companies where id in (p_seller,p_buyer) order by id for share;
  if not exists(select 1 from public.project_company_links where project_id=p_project and catalog_id=p_seller) or not exists(select 1 from public.project_company_links where project_id=p_project and catalog_id=p_buyer) then raise exception 'CONTRACT_PARTY_NOT_LINKED'; end if;
  select count(*) into own_count from public.project_companies where id in(p_seller,p_buyer) and is_own_legal_entity;
  if own_count=2 then raise exception 'CONTRACT_BOTH_OWN'; end if;
  insert into public.project_contracts(id,project_id,seller_catalog_id,buyer_catalog_id,source,encrypted_data) values(p_id,p_project,p_seller,p_buyer,p_source,p_data)
   on conflict(id) do update set seller_catalog_id=excluded.seller_catalog_id,buyer_catalog_id=excluded.buyer_catalog_id,source=excluded.source,encrypted_data=excluded.encrypted_data,revision=project_contracts.revision+1;
  delete from public.project_contract_items where contract_id=p_id;
  if p_source='expenses' then insert into public.project_contract_items(project_id,item_id,contract_id) select p_project,value::uuid,p_id from jsonb_array_elements_text(p_items); end if;
 end if;
 update public.project_estimates set revision=revision+1,updated_at=now() where project_id=p_project;
end $function$;

CREATE OR REPLACE FUNCTION public.project_execution_read(p_actor uuid, p_project uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.project_access where user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 if not exists(select 1 from public.projects p where p.id=p_project and (p.owner_id=p_actor or (public.project_section_permission(p_actor,p.id,'economy') is not null))) then raise exception 'PROJECT_NOT_FOUND'; end if;
 return jsonb_build_object('revision',coalesce((select revision from public.project_execution where project_id=p_project),0),'encryptedData',(select encrypted_data from public.project_execution where project_id=p_project),'estimateRevision',coalesce((select revision from public.project_estimates where project_id=p_project),0));
end $function$;

CREATE OR REPLACE FUNCTION public.project_execution_write(p_actor uuid, p_project uuid, p_revision integer, p_estimate_revision integer, p_contracts uuid[], p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.projects%rowtype; current_revision integer;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into p from public.projects where id=p_project for update;
 if not found or (p.owner_id<>p_actor and not (public.project_section_permission(p_actor,p_project,'economy') is not null)) then raise exception 'PROJECT_NOT_FOUND'; end if;
 if p.owner_id<>p_actor and not (public.project_section_permission(p_actor,p_project,'economy') in ('owner','editor')) then raise exception 'ACCESS_DENIED'; end if;
 select revision into current_revision from public.project_execution where project_id=p_project;
 if coalesce(current_revision,0)<>p_revision or coalesce((select revision from public.project_estimates where project_id=p_project),0)<>p_estimate_revision then raise exception 'REVISION_CONFLICT'; end if;
 if exists(select 1 from unnest(p_contracts) c where not exists(select 1 from public.project_contracts where id=c and project_id=p_project)) then raise exception 'REVISION_CONFLICT'; end if;
 insert into public.project_execution(project_id,encrypted_data) values(p_project,p_data)
 on conflict(project_id) do update set encrypted_data=excluded.encrypted_data,revision=project_execution.revision+1,updated_at=now();
 delete from public.project_execution_contracts where project_id=p_project;
 insert into public.project_execution_contracts(project_id,contract_id) select p_project,c from unnest(p_contracts) c;
end $function$;

CREATE OR REPLACE FUNCTION public.project_closing_read(p_actor uuid, p_project uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.project_access where user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 if not exists(select 1 from public.projects p where p.id=p_project and (p.owner_id=p_actor or (public.project_section_permission(p_actor,p.id,'economy') is not null))) then raise exception 'PROJECT_NOT_FOUND'; end if;
 return jsonb_build_object('revision',coalesce((select revision from public.project_closing where project_id=p_project),0),'encryptedData',(select encrypted_data from public.project_closing where project_id=p_project),'executionRevision',coalesce((select revision from public.project_execution where project_id=p_project),0),'estimateRevision',coalesce((select revision from public.project_estimates where project_id=p_project),0));
end $function$;

CREATE OR REPLACE FUNCTION public.project_closing_write(p_actor uuid, p_project uuid, p_revision integer, p_estimate_revision integer, p_execution_revision integer, p_contracts uuid[], p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.projects%rowtype; current_revision integer;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into p from public.projects where id=p_project for update;
 if not found or (p.owner_id<>p_actor and not (public.project_section_permission(p_actor,p_project,'economy') is not null)) then raise exception 'PROJECT_NOT_FOUND'; end if;
 if p.owner_id<>p_actor and not (public.project_section_permission(p_actor,p_project,'economy') in ('owner','editor')) then raise exception 'ACCESS_DENIED'; end if;
 select revision into current_revision from public.project_closing where project_id=p_project;
 if coalesce(current_revision,0)<>p_revision or coalesce((select revision from public.project_estimates where project_id=p_project),0)<>p_estimate_revision or coalesce((select revision from public.project_execution where project_id=p_project),0)<>p_execution_revision then raise exception 'REVISION_CONFLICT'; end if;
 if exists(select 1 from unnest(p_contracts) c where not exists(select 1 from public.project_contracts where id=c and project_id=p_project)) then raise exception 'REVISION_CONFLICT'; end if;
 insert into public.project_closing(project_id,encrypted_data) values(p_project,p_data)
 on conflict(project_id) do update set encrypted_data=excluded.encrypted_data,revision=project_closing.revision+1,updated_at=now();
 delete from public.project_closing_contracts where project_id=p_project;
 insert into public.project_closing_contracts(project_id,contract_id) select p_project,c from unnest(p_contracts) c;
end $function$;

CREATE OR REPLACE FUNCTION public.project_company_migrate(p_actor uuid, p_project uuid, p_records jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects%rowtype; item jsonb; selected_id uuid;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_project for update;
 if not found or not (project.owner_id=p_actor or (public.project_section_permission(p_actor,p_project,'economy') is not null)) then raise exception 'PROJECT_NOT_FOUND'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.project_company_link(p_actor uuid, p_project uuid, p_catalog uuid, p_revision integer, p_empty_data jsonb, p_remove boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects%rowtype; company public.project_companies%rowtype; estimate public.project_estimates%rowtype;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_project for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 if project.owner_id<>p_actor and not (public.project_section_permission(p_actor,p_project,'economy') is not null) then raise exception 'PROJECT_NOT_FOUND'; end if;
 if project.owner_id<>p_actor and not (public.project_section_permission(p_actor,p_project,'economy') in ('owner','editor')) then raise exception 'ACCESS_DENIED'; end if;
 select * into company from public.project_companies where id=p_catalog for key share;
 if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
 select * into estimate from public.project_estimates where project_id=p_project;
 if coalesce(estimate.revision,0)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if p_remove then delete from public.project_company_links where project_id=p_project and catalog_id=p_catalog;
 elsif not exists(select 1 from public.project_company_links where project_id=p_project and catalog_id=p_catalog) then insert into public.project_company_links(project_id,local_id,catalog_id) values(p_project,p_catalog,p_catalog); end if;
 if estimate.project_id is null then insert into public.project_estimates(project_id,encrypted_data) values(p_project,p_empty_data);
 else update public.project_estimates set revision=revision+1,updated_at=now() where project_id=p_project; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.project_company_list(p_actor uuid, p_project uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects%rowtype; permission text;
begin
 if not exists(select 1 from public.project_access where user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 if p_project is not null then
  select * into project from public.projects where id=p_project;
  permission:=public.project_section_permission(p_actor,p_project,'economy');
  if permission is null or permission='hidden' then raise exception 'PROJECT_NOT_FOUND'; end if;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'ownerId',c.owner_id,'revision',c.revision,'updatedAt',c.updated_at,'encryptedData',c.encrypted_data,'isOwnLegalEntity',c.is_own_legal_entity,'canEdit',c.owner_id=p_actor,'projectCount',(select count(*) from public.project_company_links l where l.catalog_id=c.id),
 'projects',case when p_project is null then coalesce((
  select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id)
  from public.projects p where exists(select 1 from public.project_company_links l where l.catalog_id=c.id and l.project_id=p.id)
  and (p.owner_id=p_actor or (public.project_section_permission(p_actor,p.id,'economy') is not null))
 ),'[]'::jsonb) else '[]'::jsonb end)) from public.project_companies c), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.kaban_check(p_actor uuid, p_board uuid, p_write boolean DEFAULT false, p_manage boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.kaban_boards%rowtype; m public.shared_vault_members%rowtype; manager boolean; permission text;
begin
 select * into b from public.kaban_boards where id=p_board for update;
 if not found then raise exception 'KABAN_NOT_FOUND'; end if;
 if b.project_id is not null then
  perform 1 from public.projects where id=b.project_id for share;
  permission:=public.project_section_permission(p_actor,b.project_id,'tasks');
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
end $function$;

CREATE OR REPLACE FUNCTION public.kaban_location_allowed(p_actor uuid, p_board uuid, p_categories text[], p_write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.kaban_boards b where b.id=p_board and
 ((b.project_id is not null and public.project_section_permission(p_actor,b.project_id,'tasks') in ('owner','editor',case when not p_write then 'viewer' end)) or
 (b.project_id is null and ((b.vault_id is null and b.owner_id=p_actor) or exists(select 1 from public.shared_vault_members m where m.vault_id=b.vault_id and m.user_id=p_actor and (not p_write or m.member_role<>'viewer') and public.kaban_task_visible(b.id,p_categories,m.category_ids))))));
$function$;

CREATE OR REPLACE FUNCTION public.registry_contract_files_access(p_actor uuid, p_origin text, p_contract uuid, p_write boolean DEFAULT false, p_file uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT NULL::jsonb, p_delete boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.registry_contracts%rowtype; project uuid; rev integer;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED';end if;
 if p_origin='project' then
  if p_write or p_file is not null then raise exception 'ACCESS_DENIED';end if;
  select project_id into project from public.project_contracts where id=p_contract;
  if not found then raise exception 'CONTRACT_NOT_FOUND';end if;
  if public.project_section_permission(p_actor,project,'economy') is null then raise exception 'ACCESS_DENIED';end if;
  return jsonb_build_object('projectId',project,'contractData',(select encrypted_data from public.project_contracts where id=p_contract),'files',coalesce((select jsonb_agg(jsonb_build_object('id',id,'encryptedData',encrypted_data)) from public.project_contract_files where contract_id=p_contract),'[]'::jsonb));
 elsif p_origin<>'standalone' then raise exception 'CONTRACT_NOT_FOUND';end if;
 select * into c from public.registry_contracts where id=p_contract for update;
 if not found then raise exception 'CONTRACT_NOT_FOUND';end if;
 if (p_write or p_file is not null) and c.owner_id is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
 rev:=c.revision;
 if p_file is not null then
  if p_delete then
   delete from public.registry_contract_files where id=p_file and contract_id=p_contract;
   if not found then raise exception 'FILE_NOT_FOUND';end if;
  else
   if (select count(*) from public.registry_contract_files where contract_id=p_contract)>=20 then raise exception 'FILE_LIMIT';end if;
   insert into public.registry_contract_files(id,contract_id,encrypted_data) values(p_file,p_contract,p_data);
  end if;
  update public.registry_contracts set revision=revision+1,updated_at=now() where id=p_contract returning revision into rev;
 end if;
 return jsonb_build_object('revision',rev,'files',coalesce((select jsonb_agg(jsonb_build_object('id',id,'encryptedData',encrypted_data)) from public.registry_contract_files where contract_id=p_contract),'[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION public.project_workspace_action(p_actor uuid, p_id uuid, p_revision integer, p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  insert into public.project_members(project_id,user_id,permission,kind,sections)
   select new_id,user_id,permission,kind,sections from public.project_members where project_id=p_id and user_id<>p_actor and (rights='owner' or permission<>'hidden');
  if p.owner_id<>p_actor then insert into public.project_members(project_id,user_id,permission) values(new_id,p.owner_id,'editor');end if;
  return jsonb_build_object('id',new_id);
 end if;
 if p_action in ('delete','archive','kind') and rights<>'owner' then raise exception 'ACCESS_DENIED';end if;
 if p_action='delete' then delete from public.project_contract_files where project_id=p_id; delete from public.project_execution_contracts where project_id=p_id; delete from public.project_closing_contracts where project_id=p_id; delete from public.projects where id=p_id;return '{}'::jsonb;end if;
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
end $function$;

create or replace function public.list_projects(p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item || jsonb_build_object('profile',p.profile,'favorite',coalesce(pref.favorite,false),'folderId',pref.folder_id,
 'sectionPermissions',jsonb_build_object('economy',case when p.owner_id=p_actor then 'editor' else coalesce(public.project_section_permission(p_actor,p.id,'economy'),'hidden') end,'tasks',case when p.owner_id=p_actor then 'editor' else coalesce(public.project_section_permission(p_actor,p.id,'tasks'),'hidden') end),
 'taskCount',case when public.project_section_permission(p_actor,p.id,'tasks') is null then null else (select count(distinct l.task_id) from public.kaban_task_locations l join public.kaban_boards b on b.id=l.board_id join public.kaban_tasks t on t.id=l.task_id where b.project_id=p.id and not t.archived) end,
 'members',(select coalesce(jsonb_agg(m || jsonb_build_object('sections',coalesce(pm.sections,'{}'::jsonb),'kind',coalesce(pm.kind,'executor'),'roleIds',coalesce((select jsonb_agg(role_id) from public.team_role_assignments where user_id=(m->>'userId')::uuid),'[]'::jsonb))),'[]'::jsonb) from jsonb_array_elements(item->'members') m left join public.project_members pm on pm.project_id=p.id and pm.user_id=(m->>'userId')::uuid)) order by p.created_at desc),'[]'::jsonb)
 from jsonb_array_elements(public.list_projects_v49(p_actor)) item join public.projects p on p.id=(item->>'id')::uuid left join public.project_preferences pref on pref.project_id=p.id and pref.user_id=p_actor;
$$;

do $patch$ declare def text;begin
 select pg_get_functiondef('public.kaban_project_load(uuid,uuid)'::regprocedure) into def;
 if strpos(def,'public.project_permission(p_actor,p_project)')=0 then raise exception 'Unexpected project board loader';end if;
 def:=replace(def,'public.project_permission(p_actor,p_project)', 'public.project_section_permission(p_actor,p_project,''tasks'')');
 execute def;
 select pg_get_functiondef('public.kaban_task_mutate_v34(uuid,uuid,uuid,integer,jsonb,boolean)'::regprocedure) into def;
 if strpos(def,'public.project_permission(u,b.project_id)')=0 then raise exception 'Unexpected project participant guard';end if;
 def:=replace(def,'public.project_permission(u,b.project_id)', 'public.project_section_permission(u,b.project_id,''tasks'')');
 execute def;
 select pg_get_functiondef('public.contract_register_load(uuid)'::regprocedure) into def;
 if strpos(def,'from public.projects p where exists(')=0 then raise exception 'Unexpected contract register loader';end if;
 def:=replace(def,'from public.projects p where exists(', 'from public.projects p where public.project_section_permission(p_actor,p.id,''economy'') is not null and exists(');
 execute def;
end $patch$;
notify pgrst,'reload schema';
commit;
