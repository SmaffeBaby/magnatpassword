begin;
create table if not exists public.project_contracts (
 id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
 seller_catalog_id uuid not null references public.project_companies(id),buyer_catalog_id uuid not null references public.project_companies(id),
 source text not null check(source in ('revenue','expenses')), encrypted_data jsonb not null, revision integer not null default 1,
 check(seller_catalog_id<>buyer_catalog_id)
);
create unique index if not exists project_contract_revenue on public.project_contracts(project_id) where source='revenue';
create table if not exists public.project_contract_items (
 project_id uuid not null references public.projects(id) on delete cascade,item_id uuid not null,
 contract_id uuid not null references public.project_contracts(id) on delete cascade,primary key(project_id,item_id)
);
alter table public.project_contracts enable row level security;
alter table public.project_contract_items enable row level security;
revoke all on public.project_contracts,public.project_contract_items from public,anon,authenticated;
grant all on public.project_contracts,public.project_contract_items to service_role;

create or replace function public.project_contract_list(p_actor uuid,p_project uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.project_access where user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 if not exists(select 1 from public.projects p where p.id=p_project and (p.owner_id=p_actor or exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=p_actor and m.permission in ('viewer','editor')))) then raise exception 'PROJECT_NOT_FOUND'; end if;
 return jsonb_build_object('estimateRevision',coalesce((select revision from public.project_estimates where project_id=p_project),0),'contracts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'encryptedData',encrypted_data) order by id) from public.project_contracts where project_id=p_project),'[]'::jsonb));
end $$;

create or replace function public.project_contract_mutate(p_actor uuid,p_project uuid,p_id uuid,p_revision integer,p_estimate_revision integer,p_seller uuid,p_buyer uuid,p_source text,p_items jsonb,p_data jsonb,p_delete boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare project public.projects%rowtype; existing public.project_contracts%rowtype; estimate_revision integer; own_count integer;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 -- Serialize party classification with contract writes, before acquiring company locks.
 perform pg_catalog.pg_advisory_xact_lock(172914,1);
 select * into project from public.projects where id=p_project for update;
 if not found or (project.owner_id<>p_actor and not exists(select 1 from public.project_members where project_id=p_project and user_id=p_actor and permission in ('viewer','editor'))) then raise exception 'PROJECT_NOT_FOUND'; end if;
 if project.owner_id<>p_actor and not exists(select 1 from public.project_members where project_id=p_project and user_id=p_actor and permission='editor') then raise exception 'ACCESS_DENIED'; end if;
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
end $$;

create or replace function public.project_company_mutate(p_actor uuid,p_id uuid,p_revision integer,p_data jsonb,p_hash text,p_own boolean,p_delete boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare company public.project_companies%rowtype;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 perform pg_catalog.pg_advisory_xact_lock(172914,1);
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

create or replace function public.check_company_contract_classification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_own_legal_entity and not old.is_own_legal_entity and exists(select 1 from public.project_contracts c join public.project_companies other on other.id=case when c.seller_catalog_id=new.id then c.buyer_catalog_id else c.seller_catalog_id end where new.id in(c.seller_catalog_id,c.buyer_catalog_id) and other.is_own_legal_entity) then raise exception 'CONTRACT_BOTH_OWN'; end if;
 return new;
end $$;
drop trigger if exists company_contract_classification on public.project_companies;
create trigger company_contract_classification before update of is_own_legal_entity on public.project_companies for each row execute function public.check_company_contract_classification();
create or replace function public.check_contract_company_unlink()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.projects where id=old.project_id) and exists(select 1 from public.project_contracts where project_id=old.project_id and old.catalog_id in(seller_catalog_id,buyer_catalog_id)) then raise exception 'COMPANY_CONTRACT_IN_USE'; end if;
 return old;
end $$;
drop trigger if exists contract_company_unlink on public.project_company_links;
create trigger contract_company_unlink before delete on public.project_company_links for each row execute function public.check_contract_company_unlink();
revoke all on function public.project_contract_list(uuid,uuid),public.project_contract_mutate(uuid,uuid,uuid,integer,integer,uuid,uuid,text,jsonb,jsonb,boolean),public.check_company_contract_classification(),public.check_contract_company_unlink() from public,anon,authenticated;
grant execute on function public.project_contract_list(uuid,uuid),public.project_contract_mutate(uuid,uuid,uuid,integer,integer,uuid,uuid,text,jsonb,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
