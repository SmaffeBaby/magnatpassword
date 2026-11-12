begin;
create table public.registry_contracts (
 id uuid primary key, owner_id uuid references auth.users(id) on delete set null,
 encrypted_data jsonb not null, revision integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.registry_contract_files (
 id uuid primary key,contract_id uuid not null references public.registry_contracts(id) on delete restrict,encrypted_data jsonb not null
);
create index registry_contract_file_parent on public.registry_contract_files(contract_id);
alter table public.registry_contracts enable row level security;
alter table public.registry_contract_files enable row level security;
revoke all on public.registry_contracts,public.registry_contract_files from public,anon,authenticated;
grant all on public.registry_contracts,public.registry_contract_files to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('contract-register','contract-register',false,20971520) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

-- The register is deliberately shared by everyone with section access; project membership is
-- returned only for navigation. No membership or project editing privileges are granted here.
create function public.contract_register_load(p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED';end if;
 return jsonb_build_object('projects',coalesce((
 select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'migrated',p.counterparties_migrated,
 'canOpen',p.owner_id=p_actor or exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=p_actor and m.permission in('viewer','editor')),
 'estimate',(select encrypted_data from public.project_estimates where project_id=p.id),
 'companies',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'localId',l.local_id,'encryptedData',c.encrypted_data,'isOwnLegalEntity',c.is_own_legal_entity)) from public.project_company_links l join public.project_companies c on c.id=l.catalog_id where l.project_id=p.id),'[]'::jsonb),
 'contracts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revision',c.revision,'encryptedData',c.encrypted_data,'fileCount',(select count(*) from public.project_contract_files f where f.contract_id=c.id))) from public.project_contracts c where c.project_id=p.id),'[]'::jsonb))) from public.projects p where exists(select 1 from public.project_contracts c where c.project_id=p.id)),'[]'::jsonb),
 'standalone',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('fileCount',(select count(*) from public.registry_contract_files f where f.contract_id=c.id))) from public.registry_contracts c),'[]'::jsonb));
end $$;

create function public.registry_contract_write(p_actor uuid,p_id uuid,p_revision integer,p_data jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare c public.registry_contracts%rowtype;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED';end if;
 if p_revision=0 then insert into public.registry_contracts(id,owner_id,encrypted_data) values(p_id,p_actor,p_data);return 1;end if;
 select * into c from public.registry_contracts where id=p_id for update;
 if not found then raise exception 'CONTRACT_NOT_FOUND';end if;
 if c.owner_id is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
 if c.revision<>p_revision then raise exception 'REVISION_CONFLICT';end if;
 update public.registry_contracts set encrypted_data=p_data,revision=revision+1,updated_at=now() where id=p_id;
 return p_revision+1;
end $$;

create function public.registry_contract_files_access(p_actor uuid,p_origin text,p_contract uuid,p_write boolean default false,p_file uuid default null,p_data jsonb default null,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.registry_contracts%rowtype; project uuid; rev integer;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED';end if;
 if p_origin='project' then
  if p_write or p_file is not null then raise exception 'ACCESS_DENIED';end if;
  select project_id into project from public.project_contracts where id=p_contract;
  if not found then raise exception 'CONTRACT_NOT_FOUND';end if;
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
end $$;
revoke all on function public.contract_register_load(uuid),public.registry_contract_write(uuid,uuid,integer,jsonb),public.registry_contract_files_access(uuid,text,uuid,boolean,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.contract_register_load(uuid),public.registry_contract_write(uuid,uuid,integer,jsonb),public.registry_contract_files_access(uuid,text,uuid,boolean,uuid,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
