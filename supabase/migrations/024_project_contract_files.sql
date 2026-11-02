begin;
create table if not exists public.project_contract_files (
 id uuid primary key,
 project_id uuid not null references public.projects(id) on delete cascade,
 contract_id uuid not null references public.project_contracts(id) on delete restrict,
 encrypted_data jsonb not null
);
create index if not exists project_contract_files_contract on public.project_contract_files(project_id,contract_id);
alter table public.project_contract_files enable row level security;
revoke all on public.project_contract_files from public,anon,authenticated;
grant all on public.project_contract_files to service_role;

create or replace function public.project_contract_files_access(p_actor uuid,p_project uuid,p_contract uuid,p_write boolean default false,p_file uuid default null,p_data jsonb default null,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.projects%rowtype; permission text;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_project for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 if project.owner_id=p_actor then permission:='owner';
 else select m.permission into permission from public.project_members m where m.project_id=p_project and m.user_id=p_actor; end if;
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
end $$;
revoke all on function public.project_contract_files_access(uuid,uuid,uuid,boolean,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.project_contract_files_access(uuid,uuid,uuid,boolean,uuid,jsonb,boolean) to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('project-contracts','project-contracts',false,20971520)
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;
create or replace function public.project_contract_list(p_actor uuid,p_project uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.project_access where user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 if not exists(select 1 from public.projects p where p.id=p_project and (p.owner_id=p_actor or exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=p_actor and m.permission in ('viewer','editor')))) then raise exception 'PROJECT_NOT_FOUND'; end if;
 return jsonb_build_object('estimateRevision',coalesce((select revision from public.project_estimates where project_id=p_project),0),'contracts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'encryptedData',encrypted_data,'fileCount',(select count(*) from public.project_contract_files f where f.project_id=p_project and f.contract_id=project_contracts.id)) order by id) from public.project_contracts where project_id=p_project),'[]'::jsonb));
end $$;

notify pgrst,'reload schema';
commit;
