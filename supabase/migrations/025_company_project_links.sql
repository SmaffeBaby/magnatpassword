begin;
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
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'ownerId',c.owner_id,'revision',c.revision,'updatedAt',c.updated_at,'encryptedData',c.encrypted_data,'isOwnLegalEntity',c.is_own_legal_entity,'canEdit',c.owner_id=p_actor,'projectCount',(select count(*) from public.project_company_links l where l.catalog_id=c.id),
 'projects',case when p_project is null then coalesce((
  select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id)
  from public.projects p where exists(select 1 from public.project_company_links l where l.catalog_id=c.id and l.project_id=p.id)
  and (p.owner_id=p_actor or exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=p_actor and m.permission in ('viewer','editor')))
 ),'[]'::jsonb) else '[]'::jsonb end)) from public.project_companies c), '[]'::jsonb);
end $$;

revoke all on function public.project_company_list(uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_company_list(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
