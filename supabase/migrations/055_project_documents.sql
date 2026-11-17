begin;
alter table public.project_members drop constraint project_members_sections_check;
alter table public.project_members add constraint project_members_sections_check check(
 jsonb_typeof(sections)='object' and sections - array['economy','tasks','documents']='{}'::jsonb
 and (not (sections ? 'economy') or coalesce(sections->>'economy' in ('hidden','viewer','editor'),false))
 and (not (sections ? 'tasks') or coalesce(sections->>'tasks' in ('hidden','viewer','editor'),false))
 and (not (sections ? 'documents') or coalesce(sections->>'documents' in ('hidden','viewer','editor'),false)));
create or replace function public.project_section_permission(p_actor uuid,p_id uuid,p_section text)
returns text language sql stable security definer set search_path='' as $$
 select case when p.owner_id=p_actor then 'owner' else nullif(coalesce(m.sections->>p_section,m.permission),'hidden') end
 from public.projects p left join public.project_members m on m.project_id=p.id and m.user_id=p_actor
 where p.id=p_id and p_section in ('economy','tasks','documents') and (p.owner_id=p_actor or m.permission in ('viewer','editor'));
$$;
do $patch$ declare def text;begin
 select pg_get_functiondef('public.list_projects(uuid)'::regprocedure) into def;
 if strpos(def,'''sectionPermissions'',jsonb_build_object(''economy''')=0 then raise exception 'Unexpected project list';end if;
 def:=replace(def,'''sectionPermissions'',jsonb_build_object(''economy''','''sectionPermissions'',jsonb_build_object(''documents'',case when p.owner_id=p_actor then ''editor'' else coalesce(public.project_section_permission(p_actor,p.id,''documents''),''hidden'') end,''economy''');
 execute def;
end $patch$;

create table public.project_documents(
 id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
 created_by uuid references auth.users(id) on delete set null,
 encrypted_data jsonb not null, storage_path text not null unique,
 default_permission text not null default 'inherit' check(default_permission in ('inherit','hidden','viewer','editor')),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,id)
);
create index project_documents_project on public.project_documents(project_id,updated_at desc);
create table public.project_document_members(
 project_id uuid not null, document_id uuid not null,user_id uuid not null,
 permission text not null check(permission in ('hidden','viewer','editor')),
 primary key(document_id,user_id),
 foreign key(project_id,document_id) references public.project_documents(project_id,id) on delete cascade,
 foreign key(project_id,user_id) references public.project_members(project_id,user_id) on delete cascade
);
-- Replacements use immutable objects. Queue obsolete objects in the same transaction,
-- including cascaded project deletion; failed storage cleanup can safely be retried.
create table public.project_document_cleanup(path text primary key,created_at timestamptz not null default now());
alter table public.project_documents enable row level security;
alter table public.project_document_members enable row level security;
alter table public.project_document_cleanup enable row level security;
revoke all on public.project_documents,public.project_document_members,public.project_document_cleanup from public,anon,authenticated;
grant all on public.project_documents,public.project_document_members,public.project_document_cleanup to service_role;
create function public.queue_project_document_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or old.storage_path is distinct from new.storage_path then
  insert into public.project_document_cleanup(path) values(old.storage_path) on conflict do nothing;
 end if;
 return null;
end $$;
create trigger queue_project_document_cleanup after delete or update of storage_path on public.project_documents
 for each row execute function public.queue_project_document_cleanup();
revoke all on function public.queue_project_document_cleanup() from public,anon,authenticated;

create function public.project_document_permission(p_actor uuid,p_file uuid) returns text language sql stable security definer set search_path='' as $$
 select case when p.owner_id=p_actor then 'owner' else nullif(coalesce(m.permission,nullif(d.default_permission,'inherit'),public.project_section_permission(p_actor,p.id,'documents')),'hidden') end
 from public.project_documents d join public.projects p on p.id=d.project_id
 left join public.project_document_members m on m.document_id=d.id and m.user_id=p_actor
 where d.id=p_file and public.project_section_permission(p_actor,p.id,'documents') is not null;
$$;
create function public.project_documents_read(p_actor uuid,p_project uuid,p_file uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 select p.owner_id into owner_id from public.projects p where p.id=p_project for share;
 if public.project_section_permission(p_actor,p_project,'documents') is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if p_file is not null and not exists(select 1 from public.project_documents d where d.id=p_file and d.project_id=p_project and public.project_document_permission(p_actor,d.id) is not null) then raise exception 'FILE_NOT_FOUND';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'encryptedData',d.encrypted_data,'path',d.storage_path,
 'revision',d.revision,'createdAt',d.created_at,'updatedAt',d.updated_at,'createdBy',d.created_by,
 'permission',public.project_document_permission(p_actor,d.id),'canManage',owner_id=p_actor,
 'defaultPermission',case when owner_id=p_actor then d.default_permission else null end,
 'members',case when owner_id=p_actor then coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'permission',m.permission)) from public.project_document_members m where m.document_id=d.id),'[]'::jsonb) else null end) order by d.updated_at desc,d.id)
 from public.project_documents d where d.project_id=p_project and (p_file is null or d.id=p_file) and public.project_document_permission(p_actor,d.id) is not null),'[]'::jsonb);
end $$;
create function public.project_document_mutate(p_actor uuid,p_project uuid,p_file uuid,p_revision integer,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; d public.project_documents%rowtype; rights text; target jsonb; path text;
begin
 select * into p from public.projects where id=p_project for update;
 if not found or public.project_section_permission(p_actor,p_project,'documents') is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if p_action='create' then
  if public.project_section_permission(p_actor,p_project,'documents') not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
  if p_revision is distinct from 0 then raise exception 'REVISION_CONFLICT';end if;
  if (select count(*) from public.project_documents where project_id=p_project)>=500 then raise exception 'FILE_LIMIT';end if;
 else
  select * into d from public.project_documents where id=p_file and project_id=p_project for update;
  rights:=public.project_document_permission(p_actor,p_file);
  if not found or rights is null then raise exception 'FILE_NOT_FOUND';end if;
  if p_action='access' then
   if p.owner_id<>p_actor then raise exception 'ACCESS_DENIED';end if;
  elsif rights not in ('owner','editor') then raise exception 'ACCESS_DENIED';end if;
  if d.revision is distinct from p_revision then raise exception 'REVISION_CONFLICT';end if;
 end if;
 if p_action in ('create','replace') then
  path:=p_data->>'path';
  if path is null or path !~ ('^'||p_project::text||'/'||p_file::text||'/[0-9a-f-]{36}$') then raise exception 'INVALID_FILE';end if;
 end if;
 if p_action='create' then
  insert into public.project_documents(id,project_id,created_by,encrypted_data,storage_path) values(p_file,p_project,p_actor,p_data->'encryptedData',path);
 elsif p_action='delete' then
  delete from public.project_documents where id=p_file;
  return jsonb_build_object('ok',true);
 elsif p_action='access' then
  if p_data->>'defaultPermission' is null or p_data->>'defaultPermission' not in ('inherit','hidden','viewer','editor') or jsonb_typeof(p_data->'members') is distinct from 'array' then raise exception 'INVALID_PERMISSION';end if;
  delete from public.project_document_members where document_id=p_file;
  for target in select value from jsonb_array_elements(p_data->'members') loop
   if target->>'permission' is null or target->>'permission' not in ('hidden','viewer','editor') or not exists(select 1 from public.project_members where project_id=p_project and user_id=(target->>'userId')::uuid) then raise exception 'INVALID_PERMISSION';end if;
   insert into public.project_document_members(project_id,document_id,user_id,permission) values(p_project,p_file,(target->>'userId')::uuid,target->>'permission');
  end loop;
  update public.project_documents set default_permission=p_data->>'defaultPermission',revision=revision+1,updated_at=now() where id=p_file;
 elsif p_action in ('metadata','replace') then
  update public.project_documents set encrypted_data=p_data->'encryptedData',storage_path=coalesce(path,storage_path),revision=revision+1,updated_at=now() where id=p_file;
 else raise exception 'INVALID_ACTION';end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.project_document_permission(uuid,uuid),public.project_documents_read(uuid,uuid,uuid),public.project_document_mutate(uuid,uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.project_document_permission(uuid,uuid),public.project_documents_read(uuid,uuid,uuid),public.project_document_mutate(uuid,uuid,uuid,integer,text,jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('project-documents','project-documents',false,20971520)
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;
notify pgrst,'reload schema';
commit;
