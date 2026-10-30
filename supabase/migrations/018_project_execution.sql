begin;
create table public.project_execution (
 project_id uuid primary key references public.projects(id) on delete cascade,
 revision integer not null default 1, encrypted_data jsonb not null, updated_at timestamptz not null default now()
);
create table public.project_execution_contracts (
 project_id uuid not null references public.projects(id) on delete cascade,
 contract_id uuid primary key references public.project_contracts(id)
);
alter table public.project_execution enable row level security;
alter table public.project_execution_contracts enable row level security;
revoke all on public.project_execution,public.project_execution_contracts from public,anon,authenticated;
grant all on public.project_execution,public.project_execution_contracts to service_role;
create function public.project_execution_read(p_actor uuid,p_project uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.project_access where user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 if not exists(select 1 from public.projects p where p.id=p_project and (p.owner_id=p_actor or exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=p_actor and m.permission in ('viewer','editor')))) then raise exception 'PROJECT_NOT_FOUND'; end if;
 return jsonb_build_object('revision',coalesce((select revision from public.project_execution where project_id=p_project),0),'encryptedData',(select encrypted_data from public.project_execution where project_id=p_project),'estimateRevision',coalesce((select revision from public.project_estimates where project_id=p_project),0));
end $$;
create function public.project_execution_write(p_actor uuid,p_project uuid,p_revision integer,p_estimate_revision integer,p_contracts uuid[],p_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; current_revision integer;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into p from public.projects where id=p_project for update;
 if not found or (p.owner_id<>p_actor and not exists(select 1 from public.project_members where project_id=p_project and user_id=p_actor and permission in ('editor','viewer'))) then raise exception 'PROJECT_NOT_FOUND'; end if;
 if p.owner_id<>p_actor and not exists(select 1 from public.project_members where project_id=p_project and user_id=p_actor and permission='editor') then raise exception 'ACCESS_DENIED'; end if;
 select revision into current_revision from public.project_execution where project_id=p_project;
 if coalesce(current_revision,0)<>p_revision or coalesce((select revision from public.project_estimates where project_id=p_project),0)<>p_estimate_revision then raise exception 'REVISION_CONFLICT'; end if;
 if exists(select 1 from unnest(p_contracts) c where not exists(select 1 from public.project_contracts where id=c and project_id=p_project)) then raise exception 'REVISION_CONFLICT'; end if;
 insert into public.project_execution(project_id,encrypted_data) values(p_project,p_data)
 on conflict(project_id) do update set encrypted_data=excluded.encrypted_data,revision=project_execution.revision+1,updated_at=now();
 delete from public.project_execution_contracts where project_id=p_project;
 insert into public.project_execution_contracts(project_id,contract_id) select p_project,c from unnest(p_contracts) c;
end $$;
revoke all on function public.project_execution_read(uuid,uuid),public.project_execution_write(uuid,uuid,integer,integer,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.project_execution_read(uuid,uuid),public.project_execution_write(uuid,uuid,integer,integer,uuid[],jsonb) to service_role;
notify pgrst,'reload schema';
commit;
