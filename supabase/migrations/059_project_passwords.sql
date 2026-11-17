begin;
create table public.project_passwords (
 id uuid primary key,
 project_id uuid not null references public.projects(id) on delete cascade,
 created_by uuid references auth.users(id) on delete set null,
 encrypted_data jsonb not null,
 revision integer not null default 1 check (revision > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index project_passwords_project on public.project_passwords(project_id, created_at);
alter table public.project_passwords enable row level security;
revoke all on public.project_passwords from public,anon,authenticated;
grant all on public.project_passwords to service_role;

create function public.project_passwords_read(p_actor uuid,p_project uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rights text;
begin
 perform 1 from public.projects where id=p_project for share;
 rights:=public.project_permission(p_actor,p_project);
 if rights is null then raise exception 'PROJECT_NOT_FOUND';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'createdBy',created_by,
 'createdAt',created_at,'updatedAt',updated_at,'encryptedData',encrypted_data,
 'canEdit',rights='owner' or created_by=p_actor) order by created_at,id)
 from public.project_passwords where project_id=p_project),'[]'::jsonb);
end $$;

create function public.project_password_mutate(p_actor uuid,p_project uuid,p_id uuid,p_revision integer,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare rights text; item public.project_passwords%rowtype;
begin
 -- Membership changes and password writes share the project row lock.
 perform 1 from public.projects where id=p_project for update;
 rights:=public.project_permission(p_actor,p_project);
 if rights is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if p_action='create' then
  if p_revision is distinct from 0 then raise exception 'REVISION_CONFLICT';end if;
  if (select count(*) from public.project_passwords where project_id=p_project)>=500 then raise exception 'PASSWORD_LIMIT';end if;
  insert into public.project_passwords(id,project_id,created_by,encrypted_data) values(p_id,p_project,p_actor,p_data);
 elsif p_action in ('update','delete') then
  select * into item from public.project_passwords where id=p_id and project_id=p_project for update;
  if not found then raise exception 'PASSWORD_NOT_FOUND';end if;
  if rights<>'owner' and item.created_by is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
  if item.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT';end if;
  if p_action='delete' then delete from public.project_passwords where id=p_id;
  else update public.project_passwords set encrypted_data=p_data,revision=revision+1,updated_at=now() where id=p_id;end if;
 else raise exception 'INVALID_ACTION';end if;
 return jsonb_build_object('id',p_id);
end $$;
revoke all on function public.project_passwords_read(uuid,uuid),public.project_password_mutate(uuid,uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.project_passwords_read(uuid,uuid),public.project_password_mutate(uuid,uuid,uuid,integer,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
