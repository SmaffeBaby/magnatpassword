begin;
create table public.project_spaces(id uuid primary key,project_id uuid not null references public.projects(id) on delete cascade,name text not null check(length(name) between 1 and 120));
create table public.project_space_objects(id uuid primary key,space_id uuid not null references public.project_spaces(id) on delete cascade,data jsonb not null,revision integer not null default 1);
create index on public.project_space_objects(space_id);
create table public.project_space_cursors(id uuid primary key,space_id uuid not null references public.project_spaces(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,name text not null,x double precision not null,y double precision not null,updated_at timestamptz not null default now());
create index on public.project_space_cursors(space_id);
create function public.space_visible(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.project_permission(auth.uid(),p_project) is not null $$;
revoke all on function public.space_visible(uuid) from public,anon;
grant execute on function public.space_visible(uuid) to authenticated;
alter table public.project_spaces enable row level security;
alter table public.project_space_objects enable row level security;
alter table public.project_space_cursors enable row level security;
revoke all on public.project_spaces,public.project_space_objects,public.project_space_cursors from public,anon,authenticated;
grant select on public.project_spaces,public.project_space_objects,public.project_space_cursors to authenticated;
grant all on public.project_spaces,public.project_space_objects,public.project_space_cursors to service_role;
create policy spaces_read on public.project_spaces for select to authenticated using(public.space_visible(project_id));
create policy objects_read on public.project_space_objects for select to authenticated using(exists(select 1 from public.project_spaces s where s.id=space_id));
create policy cursors_read on public.project_space_cursors for select to authenticated using(exists(select 1 from public.project_spaces s where s.id=space_id));
alter publication supabase_realtime add table public.project_spaces,public.project_space_objects,public.project_space_cursors;
create function public.space_mutate(p_actor uuid,p_project uuid,p_space uuid,p_id uuid,p_action text,p_revision integer,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare rights text;
begin
 select public.project_permission(p_actor,p_project) into rights;
 if rights is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if p_action='create' then
 if rights not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
 insert into public.project_spaces values(p_space,p_project,p_data->>'name');return;end if;
 perform 1 from public.project_spaces where id=p_space and project_id=p_project for update;
 if not found then raise exception 'PROJECT_NOT_FOUND';end if;
 if p_action='cursor' then
 insert into public.project_space_cursors values(p_id,p_space,p_actor,left(p_data->>'name',120),(p_data->>'x')::float8,(p_data->>'y')::float8,now())
 on conflict(id) do update set x=excluded.x,y=excluded.y,updated_at=now() where project_space_cursors.user_id=p_actor and project_space_cursors.space_id=p_space;
 delete from public.project_space_cursors where updated_at<now()-interval '1 minute';return;
 elsif p_action='leave' then delete from public.project_space_cursors where id=p_id and user_id=p_actor;return;end if;
 if rights not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
 if p_action='delete-space' then delete from public.project_spaces where id=p_space;return;
 elsif p_action='rename' then update public.project_spaces set name=p_data->>'name' where id=p_space;return;
 elsif p_action='put' and p_revision=0 then insert into public.project_space_objects values(p_id,p_space,p_data,1);return;
 elsif p_action='put' then update public.project_space_objects set data=p_data,revision=revision+1 where id=p_id and space_id=p_space and revision=p_revision;
 elsif p_action='delete' then delete from public.project_space_objects where id=p_id and space_id=p_space and revision=p_revision;
 else raise exception 'INVALID_ACTION';end if;
 if not found then raise exception 'REVISION_CONFLICT';end if;
end $$;
revoke all on function public.space_mutate(uuid,uuid,uuid,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.space_mutate(uuid,uuid,uuid,uuid,text,integer,jsonb) to service_role;
commit;
