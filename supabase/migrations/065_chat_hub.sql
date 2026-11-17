begin;
alter table public.project_chats alter column project_id drop not null;
alter table public.project_chats add column direct_key text;
create unique index chat_direct_pair on public.project_chats(direct_key) where direct_key is not null;
alter table public.project_chats add constraint chat_scope_check check((project_id is not null and direct_key is null) or (project_id is null and direct_key is not null));
alter table public.project_chat_files add column revision integer not null default 1;
create function public.chat_scope_member(p_actor uuid,p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when p_project is null then exists(select 1 from public.team_profiles where user_id=p_actor) else public.project_permission(p_actor,p_project) is not null end;
$$;
create or replace function public.project_chat_check(p_actor uuid,p_project uuid,p_chat uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.chat_scope_member(p_actor,p_project) then raise exception 'PROJECT_NOT_FOUND';end if;
 if p_project is null then
  perform 1 from public.project_chats c where c.id=p_chat and c.project_id is null and exists(select 1 from public.project_chat_members m where m.chat_id=c.id and m.user_id=p_actor) for update;
 else
  perform 1 from public.project_chats c where c.id=p_chat and c.project_id=p_project and exists(select 1 from public.project_chat_members m where m.chat_id=c.id and m.user_id=p_actor);
 end if;
 if not found then raise exception 'CHAT_NOT_FOUND';end if;
end $$;
create function public.chat_direct_create(p_actor uuid,p_peer uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare pair text; chat uuid;
begin
 if p_peer=p_actor or not exists(select 1 from public.team_profiles where user_id=p_peer) or not public.chat_scope_member(p_actor,null) then raise exception 'USER_NOT_ELIGIBLE';end if;
 pair:=least(p_actor,p_peer)::text||':'||greatest(p_actor,p_peer)::text;
 insert into public.project_chats(id,project_id,direct_key,name,created_by) values(gen_random_uuid(),null,pair,'Личная переписка',p_actor)
 on conflict(direct_key) where direct_key is not null do update set direct_key=excluded.direct_key returning id into chat;
 insert into public.project_chat_members(chat_id,user_id) values(chat,p_actor),(chat,p_peer) on conflict do nothing;
 perform public.project_chat_signal(chat);
 return jsonb_build_object('id',chat);
end $$;
-- Existing guarded handlers also serve personal conversations, using a NULL project scope.
do $patch$ declare def text; signature text;begin
 foreach signature in array array['public.project_chat_manage(uuid,uuid,uuid,integer,text,uuid[])','public.project_chat_send_v2(uuid,uuid,uuid,uuid,jsonb,uuid[],uuid[],uuid[],uuid[],uuid[])','public.project_chat_message_change(uuid,uuid,uuid,uuid,integer,text,jsonb,uuid[])','public.project_chat_notify(uuid)','public.project_chat_file_add(uuid,uuid,uuid,uuid,jsonb,text,jsonb,jsonb)','public.project_chat_message_json(uuid)','public.project_chat_file_read(uuid,uuid,uuid,uuid,boolean)'] loop
  select pg_get_functiondef(signature::regprocedure) into def;
  def:=replace(def,'public.project_permission(target,p_project) is null','not public.chat_scope_member(target,p_project)');
  def:=replace(def,'public.project_permission(p_actor,p_project) is null','not public.chat_scope_member(p_actor,p_project)');
  def:=replace(def,'public.project_permission(cm.user_id,c.project_id) is not null','public.chat_scope_member(cm.user_id,c.project_id)');
  def:=replace(def,'p_project::text','coalesce(p_project::text,''personal'')');
  if signature like '%project_chat_manage%' then def:=replace(def,'begin','begin if p_project is null then raise exception ''ACCESS_DENIED'';end if;');end if;
  if signature like '%project_chat_message_json%' or signature like '%project_chat_file_read%' then
   def:=replace(def,'''documentId'',f.document_id','''documentId'',f.document_id,''revision'',f.revision,''createdBy'',f.created_by');
  end if;
  execute def;
 end loop;
end $patch$;

create or replace function public.project_chat_list(p_actor uuid,p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project for share;
 if not public.chat_scope_member(p_actor,p_project) then raise exception 'PROJECT_NOT_FOUND';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'projectId',c.project_id,
 'name',case when c.project_id is null then coalesce((select full_name from public.team_profiles where user_id=(select user_id from public.project_chat_members where chat_id=c.id and user_id<>p_actor limit 1)),'Личная переписка') else c.name end,
 'createdBy',case when c.project_id is null then null else c.created_by end,'revision',c.revision,'muted',me.muted,
 'createdAt',c.created_at,'updatedAt',c.updated_at,'lastSeq',coalesce((select max(seq) from public.project_chat_messages where chat_id=c.id),0),
 'unreadCount',(select count(*) from public.project_chat_messages where chat_id=c.id and seq>me.last_read_seq and deleted_at is null and author_id is distinct from p_actor),
 'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'lastReadSeq',m.last_read_seq) order by m.user_id)
 from public.project_chat_members m where m.chat_id=c.id and public.chat_scope_member(m.user_id,p_project)),'[]'::jsonb)) order by c.updated_at desc,c.id)
 from public.project_chats c join public.project_chat_members me on me.chat_id=c.id and me.user_id=p_actor where c.project_id is not distinct from p_project),'[]'::jsonb);
end $$;
create function public.chat_directory(p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare scope uuid; items jsonb; result jsonb;
begin
 if not public.chat_scope_member(p_actor,null) then raise exception 'ACCESS_DENIED';end if;
 result:=public.project_chat_list(p_actor,null);
 for scope in select distinct c.project_id from public.project_chats c join public.project_chat_members m on m.chat_id=c.id where m.user_id=p_actor and c.project_id is not null and public.chat_scope_member(p_actor,c.project_id) loop
  items:=public.project_chat_list(p_actor,scope);
  result:=result||(select coalesce(jsonb_agg(item||jsonb_build_object('projectName',(select name from public.projects where id=scope))),'[]'::jsonb) from jsonb_array_elements(items) item);
 end loop;
 return result;
end $$;
create function public.chat_direct_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.project_chats where id=old.chat_id and project_id is null and not exists(select 1 from public.project_chat_members where chat_id=old.chat_id);
 return null;
end $$;
create trigger chat_direct_cleanup after delete on public.project_chat_members for each row execute function public.chat_direct_cleanup();

create or replace function public.project_chat_notification_messages(p_actor uuid,p_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('notificationId',n.id,'projectId',c.project_id,'chatId',c.id,
 'chatName',case when c.project_id is null then coalesce((select full_name from public.team_profiles where user_id=m.author_id),'Личная переписка') else c.name end,
 'projectName',coalesce(p.name,'Личные сообщения'),'message',public.project_chat_message_json(m.id))),'[]'::jsonb)
 from public.app_notifications n join public.project_chat_messages m on m.id=n.chat_message_id join public.project_chats c on c.id=m.chat_id left join public.projects p on p.id=c.project_id
 where n.id=any(p_ids) and n.user_id=p_actor and n.dismissed_at is null and m.deleted_at is null
 and public.chat_scope_member(p_actor,c.project_id) and exists(select 1 from public.project_chat_members where chat_id=c.id and user_id=p_actor);
$$;
create function public.chat_file_replace(p_actor uuid,p_project uuid,p_chat uuid,p_file uuid,p_revision integer,p_data jsonb,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare f public.project_chat_files%rowtype;
begin
 perform 1 from public.projects where id=p_project for update;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 select * into f from public.project_chat_files where id=p_file and chat_id=p_chat for update;
 if not found then raise exception 'FILE_NOT_FOUND';end if;
 if f.created_by is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
 if f.revision<>p_revision then raise exception 'REVISION_CONFLICT';end if;
 if p_path !~ ('^chat/'||coalesce(p_project::text,'personal')||'/'||p_chat::text||'/'||p_file::text||'/[0-9a-f-]{36}$') then raise exception 'INVALID_FILE';end if;
 update public.project_chat_files set encrypted_data=p_data,storage_path=p_path,revision=revision+1 where id=p_file;
 insert into public.project_document_cleanup(path) values(f.storage_path) on conflict do nothing;
 perform public.project_chat_signal(p_chat);
end $$;

create function public.chat_forward_send(p_actor uuid,p_source_project uuid,p_source_chat uuid,p_source_message uuid,p_source_revision integer,p_target_project uuid,p_target_chat uuid,p_message uuid,p_data jsonb,p_files uuid[],p_poll_options uuid[],p_todo_items uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id in (p_source_project,p_target_project) order by id for update;
 perform 1 from public.project_chats where id in(p_source_chat,p_target_chat) and project_id is null order by id for update;
 perform public.project_chat_check(p_actor,p_source_project,p_source_chat);
 perform public.project_chat_check(p_actor,p_target_project,p_target_chat);
 if not exists(select 1 from public.project_chat_messages where id=p_source_message and chat_id=p_source_chat and revision=p_source_revision and deleted_at is null) then raise exception 'REVISION_CONFLICT';end if;
 return public.project_chat_send_v2(p_actor,p_target_project,p_target_chat,p_message,p_data,p_files,'{}','{}',p_poll_options,p_todo_items);
end $$;

create table public.chat_task_links(message_id uuid not null references public.project_chat_messages(id) on delete cascade,task_id uuid not null references public.kaban_tasks(id) on delete cascade,board_id uuid not null references public.kaban_boards(id) on delete cascade,primary key(message_id,task_id));
alter table public.chat_task_links enable row level security;
revoke all on public.chat_task_links from public,anon,authenticated;
grant all on public.chat_task_links to service_role;
create function public.chat_task_link(p_actor uuid,p_project uuid,p_chat uuid,p_message uuid,p_task uuid,p_board uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project for update;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 if not exists(select 1 from public.project_chat_messages where id=p_message and chat_id=p_chat and author_id=p_actor and deleted_at is null) then raise exception 'MESSAGE_NOT_FOUND';end if;
 perform public.kaban_task_access(p_actor,p_task,false,p_board);
 insert into public.chat_task_links(message_id,task_id,board_id) values(p_message,p_task,p_board) on conflict do nothing;
end $$;
create function public.chat_task_live() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; chat uuid;
begin
 if tg_op='DELETE' then target:=old.id;else target:=new.id;end if;
 for chat in select distinct m.chat_id from public.chat_task_links l join public.project_chat_messages m on m.id=l.message_id where l.task_id=target loop perform public.project_chat_signal(chat);end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger chat_task_live before update or delete on public.kaban_tasks for each row execute function public.chat_task_live();
revoke all on function public.chat_scope_member(uuid,uuid),public.chat_direct_cleanup(),public.chat_task_live() from public,anon,authenticated;
revoke all on function public.chat_direct_create(uuid,uuid),public.chat_directory(uuid),public.chat_file_replace(uuid,uuid,uuid,uuid,integer,jsonb,text),public.chat_forward_send(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,jsonb,uuid[],uuid[],uuid[]),public.chat_task_link(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.chat_direct_create(uuid,uuid),public.chat_directory(uuid),public.chat_file_replace(uuid,uuid,uuid,uuid,integer,jsonb,text),public.chat_forward_send(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,jsonb,uuid[],uuid[],uuid[]),public.chat_task_link(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;

create function public.chat_send_message(p_actor uuid,p_project uuid,p_chat uuid,p_message uuid,p_data jsonb,p_files uuid[],p_passwords uuid[],p_mentions uuid[],p_poll_options uuid[],p_todo_items uuid[],p_tasks jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; result jsonb;
begin
 perform 1 from public.projects where id=p_project for update;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 if exists(select 1 from public.project_chat_messages where id=p_message) then return public.project_chat_send_v2(p_actor,p_project,p_chat,p_message,p_data,p_files,p_passwords,p_mentions,p_poll_options,p_todo_items);end if;
 if jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks)>10 then raise exception 'INVALID_CHAT';end if;
 for item in select value from jsonb_array_elements(p_tasks) loop perform public.kaban_task_access(p_actor,(item->>'taskId')::uuid,false,(item->>'boardId')::uuid);end loop;
 result:=public.project_chat_send_v2(p_actor,p_project,p_chat,p_message,p_data,p_files,p_passwords,p_mentions,p_poll_options,p_todo_items);
 for item in select value from jsonb_array_elements(p_tasks) loop insert into public.chat_task_links(message_id,task_id,board_id) values(p_message,(item->>'taskId')::uuid,(item->>'boardId')::uuid) on conflict do nothing;end loop;
 return result;
end $$;
revoke all on function public.chat_send_message(uuid,uuid,uuid,uuid,jsonb,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.chat_send_message(uuid,uuid,uuid,uuid,jsonb,uuid[],uuid[],uuid[],uuid[],uuid[],jsonb) to service_role;


create function public.chat_selectable(p_actor uuid,p_project uuid,p_chat uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project for share;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'seq',seq,'revision',revision,'authorId',author_id) order by seq) from public.project_chat_messages where chat_id=p_chat and author_id=p_actor and deleted_at is null),'[]'::jsonb);
end $$;
revoke all on function public.chat_selectable(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.chat_selectable(uuid,uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
