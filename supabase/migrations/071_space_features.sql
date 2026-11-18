begin;
alter table public.project_spaces add column created_by uuid references auth.users(id) on delete set null,add column description text not null default '' check(length(description)<=2000),add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();
update public.project_spaces s set created_by=p.owner_id from public.projects p where p.id=s.project_id;
create table public.project_space_members(space_id uuid not null references public.project_spaces(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,permission text not null check(permission in ('viewer','editor')),primary key(space_id,user_id));
alter table public.project_space_members enable row level security;
revoke all on public.project_space_members from public,anon,authenticated;
grant all on public.project_space_members to service_role;
create function public.space_permission(p_actor uuid,p_space uuid) returns text language sql stable security definer set search_path='' as $$
 select case when public.project_permission(p_actor,s.project_id) is null then null when s.created_by=p_actor then 'owner' else coalesce(m.permission,public.project_permission(p_actor,s.project_id)) end from public.project_spaces s left join public.project_space_members m on m.space_id=s.id and m.user_id=p_actor where s.id=p_space
$$;
create function public.space_catalog(p_actor uuid,p_project uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('permission',public.space_permission(p_actor,s.id),'members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.project_space_members m where m.space_id=s.id),'object_count',(select count(*) from public.project_space_objects o where o.space_id=s.id)) order by s.updated_at desc),'[]') from public.project_spaces s where s.project_id=p_project and public.project_permission(p_actor,p_project) is not null
$$;
revoke all on function public.space_permission(uuid,uuid),public.space_catalog(uuid,uuid) from public,anon,authenticated;
grant execute on function public.space_permission(uuid,uuid),public.space_catalog(uuid,uuid) to service_role;
create or replace function public.space_mutate(p_actor uuid,p_project uuid,p_space uuid,p_id uuid,p_action text,p_revision integer,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare rights text; creator uuid; previous jsonb;
begin
 select public.project_permission(p_actor,p_project) into rights;
 if rights is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if p_action='create' then
 if rights not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
 insert into public.project_spaces(id,project_id,name,created_by,description) values(p_space,p_project,p_data->>'name',p_actor,coalesce(p_data->>'description',''));return;end if;
 select created_by into creator from public.project_spaces where id=p_space and project_id=p_project for update;
 if not found then raise exception 'PROJECT_NOT_FOUND';end if;
 rights:=public.space_permission(p_actor,p_space);
 if p_action='access' then
 if creator is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
 if public.project_permission((p_data->>'userId')::uuid,p_project) is null or (p_data->>'userId')::uuid=creator then raise exception 'ACCESS_DENIED';end if;
 insert into public.project_space_members(space_id,user_id,permission) values(p_space,(p_data->>'userId')::uuid,p_data->>'permission') on conflict(space_id,user_id) do update set permission=excluded.permission;
 update public.project_spaces set updated_at=now() where id=p_space;return;
 elsif p_action='delete-space' then
 if creator is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
 delete from public.project_spaces where id=p_space;return;
 elsif p_action='rename' then
 if creator is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
 update public.project_spaces set name=p_data->>'name',description=coalesce(p_data->>'description',''),updated_at=now() where id=p_space;return;
 end if;
 if p_action='cursor' then
 insert into public.project_space_cursors values(p_id,p_space,p_actor,left(p_data->>'name',120),(p_data->>'x')::float8,(p_data->>'y')::float8,now())
 on conflict(id) do update set x=excluded.x,y=excluded.y,updated_at=now() where project_space_cursors.user_id=p_actor and project_space_cursors.space_id=p_space;
 delete from public.project_space_cursors where updated_at<now()-interval '1 minute';return;
 elsif p_action='leave' then delete from public.project_space_cursors where id=p_id and user_id=p_actor;return;end if;
 if rights not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
 if p_action='reply' then
 select data into previous from public.project_space_objects where id=p_id and space_id=p_space and data->>'kind'='comment' for update;
 if not found then raise exception 'PROJECT_NOT_FOUND';end if;
 if jsonb_array_length(coalesce(previous->'messages','[]'))>=200 then raise exception 'INVALID_ACTION';end if;
 update public.project_space_objects set data=jsonb_set(data,'{messages}',coalesce(data->'messages','[]')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'author',p_actor,'text',p_data->>'text','createdAt',now()))),revision=revision+1 where id=p_id;return;
 elsif p_action='put' and p_revision=0 then insert into public.project_space_objects values(p_id,p_space,p_data,1);return;
 elsif p_action='put' then update public.project_space_objects set data=case when data->>'kind'='comment' then p_data||jsonb_build_object('messages',coalesce(data->'messages','[]')) else p_data end,revision=revision+1 where id=p_id and space_id=p_space and revision=p_revision;
 elsif p_action='delete' then delete from public.project_space_objects where id=p_id and space_id=p_space and revision=p_revision;
 else raise exception 'INVALID_ACTION';end if;
 if not found then raise exception 'REVISION_CONFLICT';end if;
end $$;
commit;
