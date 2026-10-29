begin;
-- The directory is shared by all accounts with access to the Projects module.
create or replace function public.project_company_list(p_actor uuid,p_project uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.projects%rowtype; permission text;
begin
 if not exists(select 1 from public.project_access where user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 if p_project is not null then
  select * into project from public.projects where id=p_project;
  if project.owner_id=p_actor then permission:='owner'; else select m.permission into permission from public.project_members m where m.project_id=p_project and m.user_id=p_actor; end if;
  if permission is null or permission='hidden' then raise exception 'PROJECT_NOT_FOUND'; end if;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'ownerId',c.owner_id,'revision',c.revision,'encryptedData',c.encrypted_data,'isOwnLegalEntity',c.is_own_legal_entity,'canEdit',c.owner_id=p_actor,'projectCount',(select count(*) from public.project_company_links l where l.catalog_id=c.id))) from public.project_companies c), '[]'::jsonb);
end $$;

create or replace function public.project_company_link(p_actor uuid,p_project uuid,p_catalog uuid,p_revision integer,p_empty_data jsonb,p_remove boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare project public.projects%rowtype; company public.project_companies%rowtype; estimate public.project_estimates%rowtype;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_project for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 if project.owner_id<>p_actor and not exists(select 1 from public.project_members where project_id=p_project and user_id=p_actor and permission in ('viewer','editor')) then raise exception 'PROJECT_NOT_FOUND'; end if;
 if project.owner_id<>p_actor and not exists(select 1 from public.project_members where project_id=p_project and user_id=p_actor and permission='editor') then raise exception 'ACCESS_DENIED'; end if;
 select * into company from public.project_companies where id=p_catalog for key share;
 if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
 select * into estimate from public.project_estimates where project_id=p_project;
 if coalesce(estimate.revision,0)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if p_remove then delete from public.project_company_links where project_id=p_project and catalog_id=p_catalog;
 elsif not exists(select 1 from public.project_company_links where project_id=p_project and catalog_id=p_catalog) then insert into public.project_company_links(project_id,local_id,catalog_id) values(p_project,p_catalog,p_catalog); end if;
 if estimate.project_id is null then insert into public.project_estimates(project_id,encrypted_data) values(p_project,p_empty_data);
 else update public.project_estimates set revision=revision+1,updated_at=now() where project_id=p_project; end if;
end $$;
revoke all on function public.project_company_list(uuid,uuid),public.project_company_link(uuid,uuid,uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.project_company_list(uuid,uuid),public.project_company_link(uuid,uuid,uuid,integer,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
