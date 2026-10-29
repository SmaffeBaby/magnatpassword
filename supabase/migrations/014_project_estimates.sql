begin;
create table if not exists public.project_estimates (
 project_id uuid primary key references public.projects(id) on delete cascade,
 encrypted_data jsonb not null,
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
alter table public.project_estimates enable row level security;
revoke all on public.project_estimates from public,anon,authenticated;
grant all on public.project_estimates to service_role;
create or replace function public.project_estimate(p_actor uuid,p_id uuid,p_revision integer default null,p_data jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.projects%rowtype; permission text; estimate public.project_estimates%rowtype;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 -- Serialize with membership changes and project deletion as well as concurrent estimate writes.
 select * into project from public.projects where id=p_id for update;
 if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
 if project.owner_id=p_actor then permission:='owner';
 else select m.permission into permission from public.project_members m where m.project_id=p_id and m.user_id=p_actor; end if;
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
end $$;
revoke all on function public.project_estimate(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.project_estimate(uuid,uuid,integer,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
