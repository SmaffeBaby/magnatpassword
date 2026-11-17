begin;
create table public.project_chats (
 id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 120),
 created_by uuid references auth.users(id) on delete set null,
 revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,id)
);
create table public.project_chat_members (
 chat_id uuid not null references public.project_chats(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 last_read_seq bigint not null default 0 check(last_read_seq>=0), primary key(chat_id,user_id)
);
create index project_chat_members_user on public.project_chat_members(user_id,chat_id);
create table public.project_chat_messages (
 id uuid primary key, chat_id uuid not null references public.project_chats(id) on delete cascade,
 seq bigint generated always as identity unique,
 author_id uuid references auth.users(id) on delete set null,
 encrypted_data jsonb not null, created_at timestamptz not null default now()
);
create index project_chat_messages_page on public.project_chat_messages(chat_id,seq desc);
create table public.project_chat_files (
 id uuid primary key, chat_id uuid not null references public.project_chats(id) on delete cascade,
 created_by uuid references auth.users(id) on delete set null,
 encrypted_data jsonb not null, storage_path text not null unique,
 document_id uuid references public.project_documents(id) on delete set null,
 created_at timestamptz not null default now()
);
create index project_chat_files_chat on public.project_chat_files(chat_id);
create table public.project_chat_message_files (
 message_id uuid not null references public.project_chat_messages(id) on delete cascade,
 file_id uuid not null references public.project_chat_files(id) on delete cascade,
 primary key(message_id,file_id)
);
alter table public.project_chats enable row level security;
alter table public.project_chat_members enable row level security;
alter table public.project_chat_messages enable row level security;
alter table public.project_chat_files enable row level security;
alter table public.project_chat_message_files enable row level security;
revoke all on public.project_chats,public.project_chat_members,public.project_chat_messages,public.project_chat_files,public.project_chat_message_files from public,anon,authenticated;
grant all on public.project_chats,public.project_chat_members,public.project_chat_messages,public.project_chat_files,public.project_chat_message_files to service_role;
grant usage,select on sequence public.project_chat_messages_seq_seq to service_role;

-- Realtime transports only a per-user invalidation token. Content stays behind authenticated API guards.
create table public.project_chat_live(user_id uuid primary key references auth.users(id) on delete cascade,token uuid not null default gen_random_uuid());
alter table public.project_chat_live enable row level security;
revoke all on public.project_chat_live from public,anon,authenticated;
grant select on public.project_chat_live to authenticated;
grant all on public.project_chat_live to service_role;
create policy project_chat_live_self on public.project_chat_live for select to authenticated using(user_id=(select auth.uid()));
alter publication supabase_realtime add table public.project_chat_live;

create function public.project_chat_check(p_actor uuid,p_project uuid,p_chat uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.project_permission(p_actor,p_project) is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if not exists(select 1 from public.project_chats c join public.project_chat_members m on m.chat_id=c.id
 where c.id=p_chat and c.project_id=p_project and m.user_id=p_actor) then raise exception 'CHAT_NOT_FOUND';end if;
end $$;
create function public.project_chat_signal(p_chat uuid,p_extra uuid default null) returns void language sql security definer set search_path='' as $$
 insert into public.project_chat_live(user_id)
 select distinct user_id from (select user_id from public.project_chat_members where chat_id=p_chat union select p_extra where p_extra is not null) u
 where exists(select 1 from auth.users where id=u.user_id)
 on conflict(user_id) do update set token=gen_random_uuid();
$$;
create function public.project_chat_members_live() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then perform public.project_chat_signal(old.chat_id,old.user_id);
 else perform public.project_chat_signal(new.chat_id,new.user_id);end if;
 return null;
end $$;
create trigger project_chat_members_live after insert or update or delete on public.project_chat_members for each row execute function public.project_chat_members_live();
create function public.project_chat_project_live() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; extra uuid; chat uuid;
begin
 if tg_table_name='projects' then target:=old.id;
 elsif tg_op='DELETE' then target:=old.project_id;extra:=old.user_id;
 else target:=new.project_id;extra:=new.user_id;end if;
 for chat in select id from public.project_chats where project_id=target loop perform public.project_chat_signal(chat,extra);end loop;
 return null;
end $$;
create trigger project_chat_project_members_live after insert or update or delete on public.project_members for each row execute function public.project_chat_project_live();
create trigger project_chat_project_delete_live before delete on public.projects for each row execute function public.project_chat_project_live();
create function public.project_chat_file_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.project_document_cleanup(path) values(old.storage_path) on conflict do nothing;return null;end $$;
create trigger project_chat_file_cleanup after delete on public.project_chat_files for each row execute function public.project_chat_file_cleanup();

create function public.project_chat_list(p_actor uuid,p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project for share;
 if public.project_permission(p_actor,p_project) is null then raise exception 'PROJECT_NOT_FOUND';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'createdBy',c.created_by,'revision',c.revision,
 'createdAt',c.created_at,'updatedAt',c.updated_at,'lastSeq',coalesce((select max(seq) from public.project_chat_messages where chat_id=c.id),0),
 'unreadCount',(select count(*) from public.project_chat_messages where chat_id=c.id and seq>me.last_read_seq and author_id is distinct from p_actor),
 'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'lastReadSeq',m.last_read_seq) order by m.user_id)
 from public.project_chat_members m where m.chat_id=c.id and public.project_permission(m.user_id,p_project) is not null),'[]'::jsonb)) order by c.updated_at desc,c.id)
 from public.project_chats c join public.project_chat_members me on me.chat_id=c.id and me.user_id=p_actor where c.project_id=p_project),'[]'::jsonb);
end $$;

create function public.project_chat_manage(p_actor uuid,p_project uuid,p_chat uuid,p_revision integer,p_name text,p_members uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.project_chats%rowtype; member uuid;
begin
 perform 1 from public.projects where id=p_project for update;
 if public.project_permission(p_actor,p_project) is null then raise exception 'PROJECT_NOT_FOUND';end if;
 if length(btrim(p_name)) not between 1 and 120 or p_name is null or cardinality(p_members)>100 then raise exception 'INVALID_CHAT';end if;
 if p_revision=0 then
  if (select count(*) from public.project_chats where project_id=p_project)>=100 then raise exception 'CHAT_LIMIT';end if;
 else
  perform public.project_chat_check(p_actor,p_project,p_chat);
  select * into c from public.project_chats where id=p_chat for update;
  if c.created_by is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
  if c.revision<>p_revision then raise exception 'REVISION_CONFLICT';end if;
 end if;
 foreach member in array p_members loop
  if public.project_permission(member,p_project) is null then raise exception 'USER_NOT_ELIGIBLE';end if;
 end loop;
 if p_revision=0 then
  insert into public.project_chats(id,project_id,name,created_by) values(p_chat,p_project,btrim(p_name),p_actor);
 else
  update public.project_chats set name=btrim(p_name),revision=revision+1 where id=p_chat;
  delete from public.project_chat_members where chat_id=p_chat and user_id<>p_actor and not(user_id=any(p_members));
 end if;
 insert into public.project_chat_members(chat_id,user_id) select p_chat,u from (select unnest(p_members) u union select p_actor) members on conflict do nothing;
 perform public.project_chat_signal(p_chat);
 return jsonb_build_object('id',p_chat);
end $$;

create function public.project_chat_messages_read(p_actor uuid,p_project uuid,p_chat uuid,p_before bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare first_seq bigint; items jsonb;
begin
 perform 1 from public.projects where id=p_project for share;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 select min(seq),coalesce(jsonb_agg(jsonb_build_object('id',x.id,'seq',x.seq,'authorId',x.author_id,'createdAt',x.created_at,'encryptedData',x.encrypted_data,
 'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'encryptedData',f.encrypted_data,'documentId',f.document_id) order by f.created_at,f.id)
 from public.project_chat_message_files mf join public.project_chat_files f on f.id=mf.file_id where mf.message_id=x.id),'[]'::jsonb)) order by seq),'[]'::jsonb)
 into first_seq,items from (select * from public.project_chat_messages where chat_id=p_chat and (p_before is null or seq<p_before) order by seq desc limit 60) x;
 return jsonb_build_object('messages',items,'nextBefore',case when exists(select 1 from public.project_chat_messages where chat_id=p_chat and seq<first_seq) then first_seq else null end);
end $$;

create function public.project_chat_send(p_actor uuid,p_project uuid,p_chat uuid,p_message uuid,p_data jsonb,p_files uuid[],p_passwords uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare item uuid; previous public.project_chat_messages%rowtype;
begin
 perform 1 from public.projects where id=p_project for update;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 select * into previous from public.project_chat_messages where id=p_message;
 if found then
  if previous.chat_id<>p_chat or previous.author_id is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
  return jsonb_build_object('id',previous.id);
 end if;
 if cardinality(p_files)>10 or cardinality(p_passwords)>10 then raise exception 'INVALID_CHAT';end if;
 foreach item in array p_files loop
  if not exists(select 1 from public.project_chat_files f where f.id=item and f.chat_id=p_chat and
   (f.created_by=p_actor or exists(select 1 from public.project_chat_message_files mf where mf.file_id=f.id))) then raise exception 'FILE_NOT_FOUND';end if;
 end loop;
 foreach item in array p_passwords loop
  if not exists(select 1 from public.project_passwords where id=item and project_id=p_project) then raise exception 'PASSWORD_NOT_FOUND';end if;
 end loop;
 insert into public.project_chat_messages(id,chat_id,author_id,encrypted_data) values(p_message,p_chat,p_actor,p_data);
 insert into public.project_chat_message_files(message_id,file_id) select p_message,unnest(p_files) on conflict do nothing;
 update public.project_chats set updated_at=now() where id=p_chat;
 perform public.project_chat_signal(p_chat);
 return jsonb_build_object('id',p_message);
end $$;

create function public.project_chat_mark_read(p_actor uuid,p_project uuid,p_chat uuid,p_seq bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project for update;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 if p_seq<0 or (p_seq>0 and not exists(select 1 from public.project_chat_messages where chat_id=p_chat and seq=p_seq)) then raise exception 'INVALID_CHAT';end if;
 update public.project_chat_members set last_read_seq=p_seq where chat_id=p_chat and user_id=p_actor and last_read_seq<p_seq;
end $$;

create function public.project_chat_file_add(p_actor uuid,p_project uuid,p_chat uuid,p_file uuid,p_data jsonb,p_path text,p_document jsonb default null,p_source jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare document uuid;
begin
 perform 1 from public.projects where id=p_project for update;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 if p_path !~ ('^chat/'||p_project::text||'/'||p_chat::text||'/'||p_file::text||'/[0-9a-f-]{36}$') then raise exception 'INVALID_FILE';end if;
 delete from public.project_chat_files where chat_id=p_chat and created_by=p_actor and created_at<now()-interval '24 hours' and not exists(select 1 from public.project_chat_message_files where file_id=project_chat_files.id);
 if (select count(*) from public.project_chat_files where chat_id=p_chat and created_by=p_actor and not exists(select 1 from public.project_chat_message_files where file_id=project_chat_files.id))>=30 then raise exception 'FILE_LIMIT';end if;
 if p_source is not null then
  if not exists(select 1 from public.project_documents d where d.id=(p_source->>'id')::uuid and d.project_id=p_project and d.revision=(p_source->>'revision')::integer and public.project_document_permission(p_actor,d.id) is not null) then raise exception 'FILE_NOT_FOUND';end if;
 end if;
 if p_document is not null then
  document:=(p_document->>'id')::uuid;
  perform public.project_document_mutate(p_actor,p_project,document,0,'create',p_document);
 end if;
 insert into public.project_chat_files(id,chat_id,created_by,encrypted_data,storage_path,document_id) values(p_file,p_chat,p_actor,p_data,p_path,document);
 return jsonb_build_object('id',p_file,'documentId',document);
end $$;
create function public.project_chat_file_read(p_actor uuid,p_project uuid,p_chat uuid,p_file uuid,p_delete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.project_chat_files%rowtype; attached boolean;
begin
 perform 1 from public.projects where id=p_project for share;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 select * into f from public.project_chat_files where id=p_file and chat_id=p_chat for update;
 if not found then raise exception 'FILE_NOT_FOUND';end if;
 attached:=exists(select 1 from public.project_chat_message_files where file_id=p_file);
 if not attached and f.created_by is distinct from p_actor then raise exception 'FILE_NOT_FOUND';end if;
 if p_delete then
  if attached or f.created_by is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
  delete from public.project_chat_files where id=p_file;
 end if;
 return jsonb_build_object('id',f.id,'encryptedData',f.encrypted_data,'path',f.storage_path,'documentId',f.document_id);
end $$;

create function public.project_chat_password_live() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; chat uuid;
begin
 if tg_op='DELETE' then target:=old.project_id;else target:=new.project_id;end if;
 for chat in select id from public.project_chats where project_id=target loop perform public.project_chat_signal(chat);end loop;
 return null;
end $$;
create trigger project_chat_password_live after insert or update or delete on public.project_passwords for each row execute function public.project_chat_password_live();
revoke all on function public.project_chat_password_live() from public,anon,authenticated;

revoke all on function public.project_chat_check(uuid,uuid,uuid),public.project_chat_signal(uuid,uuid),public.project_chat_members_live(),public.project_chat_project_live(),public.project_chat_file_cleanup(),public.project_chat_list(uuid,uuid),public.project_chat_manage(uuid,uuid,uuid,integer,text,uuid[]),public.project_chat_messages_read(uuid,uuid,uuid,bigint),public.project_chat_send(uuid,uuid,uuid,uuid,jsonb,uuid[],uuid[]),public.project_chat_mark_read(uuid,uuid,uuid,bigint),public.project_chat_file_add(uuid,uuid,uuid,uuid,jsonb,text,jsonb,jsonb),public.project_chat_file_read(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.project_chat_check(uuid,uuid,uuid),public.project_chat_list(uuid,uuid),public.project_chat_manage(uuid,uuid,uuid,integer,text,uuid[]),public.project_chat_messages_read(uuid,uuid,uuid,bigint),public.project_chat_send(uuid,uuid,uuid,uuid,jsonb,uuid[],uuid[]),public.project_chat_mark_read(uuid,uuid,uuid,bigint),public.project_chat_file_add(uuid,uuid,uuid,uuid,jsonb,text,jsonb,jsonb),public.project_chat_file_read(uuid,uuid,uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
