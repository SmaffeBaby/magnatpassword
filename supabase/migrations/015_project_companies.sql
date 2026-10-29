begin;
alter table public.projects add column if not exists counterparties_migrated boolean not null default false;
create table if not exists public.project_companies (
 id uuid primary key, owner_id uuid references public.team_profiles(user_id) on delete set null,
 identity_hash text not null, encrypted_data jsonb not null, is_own_legal_entity boolean not null default false,
 revision integer not null default 1, updated_at timestamptz not null default now(), unique(owner_id,identity_hash)
);
create table if not exists public.project_company_links (
 project_id uuid not null references public.projects(id) on delete cascade,
 local_id uuid not null, catalog_id uuid not null references public.project_companies(id) on delete restrict,
 primary key(project_id,local_id)
);
create index if not exists project_company_links_catalog on public.project_company_links(catalog_id);
alter table public.project_companies enable row level security;
alter table public.project_company_links enable row level security;
revoke all on public.project_companies,public.project_company_links from public,anon,authenticated;
grant all on public.project_companies,public.project_company_links to service_role;

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
 return jsonb_build_object('migrated',project.counterparties_migrated,'records',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'localId',l.local_id,'encryptedData',c.encrypted_data,'isOwnLegalEntity',c.is_own_legal_entity)) from public.project_company_links l join public.project_companies c on c.id=l.catalog_id where l.project_id=p_project),'[]'::jsonb));
end $$;

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

create or replace function public.project_company_mutate(p_actor uuid,p_id uuid,p_revision integer,p_data jsonb,p_hash text,p_own boolean,p_delete boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare company public.project_companies%rowtype;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 if p_revision=0 then
  insert into public.project_companies(id,owner_id,identity_hash,encrypted_data,is_own_legal_entity) values(p_id,p_actor,p_hash,p_data,p_own); return;
 end if;
 select * into company from public.project_companies where id=p_id for update;
 if not found or company.owner_id is distinct from p_actor then raise exception 'COMPANY_NOT_FOUND'; end if;
 if company.revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if p_delete then
  if exists(select 1 from public.project_company_links where catalog_id=p_id) then raise exception 'COMPANY_IN_USE'; end if;
  delete from public.project_companies where id=p_id;
 else
  update public.project_companies set encrypted_data=p_data,identity_hash=p_hash,is_own_legal_entity=p_own,revision=revision+1,updated_at=now() where id=p_id;
 end if;
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
revoke all on function public.project_company_migrate(uuid,uuid,jsonb),public.project_company_list(uuid,uuid),public.project_company_mutate(uuid,uuid,integer,jsonb,text,boolean,boolean),public.project_company_link(uuid,uuid,uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.project_company_migrate(uuid,uuid,jsonb),public.project_company_list(uuid,uuid),public.project_company_mutate(uuid,uuid,integer,jsonb,text,boolean,boolean),public.project_company_link(uuid,uuid,uuid,integer,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
