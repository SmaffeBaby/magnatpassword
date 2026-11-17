begin;
alter table public.project_chat_members add column muted boolean not null default false;
alter table public.project_chat_messages add column revision integer not null default 1,
 add column edited_at timestamptz, add column deleted_at timestamptz,
 add column mention_ids uuid[] not null default '{}',
 add column poll_options uuid[] not null default '{}', add column todo_items uuid[] not null default '{}',
 add column poll_closed boolean not null default false;
create table public.project_chat_pins (
 message_id uuid primary key references public.project_chat_messages(id) on delete cascade,
 chat_id uuid not null references public.project_chats(id) on delete cascade,
 pinned_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index project_chat_pins_chat on public.project_chat_pins(chat_id,message_id);
create table public.project_chat_votes (
 message_id uuid not null references public.project_chat_messages(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 option_id uuid not null, primary key(message_id,user_id)
);
create table public.project_chat_todos (
 message_id uuid not null references public.project_chat_messages(id) on delete cascade,
 item_id uuid not null, done boolean not null,
 updated_by uuid references auth.users(id) on delete set null,
 primary key(message_id,item_id)
);
alter table public.project_chat_pins enable row level security;
alter table public.project_chat_votes enable row level security;
alter table public.project_chat_todos enable row level security;
revoke all on public.project_chat_pins,public.project_chat_votes,public.project_chat_todos from public,anon,authenticated;
grant all on public.project_chat_pins,public.project_chat_votes,public.project_chat_todos to service_role;
alter table public.app_notifications drop constraint app_notifications_kind_check;
alter table public.app_notifications add constraint app_notifications_kind_check check(kind in ('shared','subscription','kaban','project-chat'));
alter table public.app_notifications add column chat_message_id uuid references public.project_chat_messages(id) on delete cascade;
create index app_notifications_chat_message on public.app_notifications(chat_message_id,user_id) where chat_message_id is not null;

create function public.project_chat_message_json(p_message uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'seq',m.seq,'authorId',m.author_id,'createdAt',m.created_at,'encryptedData',m.encrypted_data,
 'revision',m.revision,'editedAt',m.edited_at,'deletedAt',m.deleted_at,'mentionIds',m.mention_ids,'pollClosed',m.poll_closed,
 'pinned',exists(select 1 from public.project_chat_pins where message_id=m.id),
 'votes',coalesce((select jsonb_agg(jsonb_build_object('userId',user_id,'optionId',option_id) order by user_id) from public.project_chat_votes where message_id=m.id),'[]'::jsonb),
 'todoStates',coalesce((select jsonb_agg(jsonb_build_object('itemId',item_id,'done',done,'updatedBy',updated_by) order by item_id) from public.project_chat_todos where message_id=m.id),'[]'::jsonb),
 'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'encryptedData',f.encrypted_data,'documentId',f.document_id) order by f.created_at,f.id) from public.project_chat_message_files mf join public.project_chat_files f on f.id=mf.file_id where mf.message_id=m.id),'[]'::jsonb))
 from public.project_chat_messages m where m.id=p_message;
$$;
create function public.project_chat_feed(p_actor uuid,p_project uuid,p_chat uuid,p_before bigint default null,p_pinned boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare first_seq bigint; items jsonb;
begin
 perform 1 from public.projects where id=p_project for share;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 select min(seq),coalesce(jsonb_agg(public.project_chat_message_json(id) order by seq),'[]'::jsonb) into first_seq,items
 from (select m.id,m.seq from public.project_chat_messages m where m.chat_id=p_chat and (p_before is null or m.seq<p_before)
 and (not p_pinned or (m.deleted_at is null and exists(select 1 from public.project_chat_pins p where p.message_id=m.id))) order by m.seq desc limit 60) x;
 return jsonb_build_object('messages',items,'nextBefore',case when exists(select 1 from public.project_chat_messages m where m.chat_id=p_chat and m.seq<first_seq and (not p_pinned or (m.deleted_at is null and exists(select 1 from public.project_chat_pins p where p.message_id=m.id)))) then first_seq else null end);
end $$;
create function public.project_chat_message_get(p_actor uuid,p_project uuid,p_chat uuid,p_message uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project for share;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 if not exists(select 1 from public.project_chat_messages where id=p_message and chat_id=p_chat) then raise exception 'MESSAGE_NOT_FOUND';end if;
 return public.project_chat_message_json(p_message);
end $$;
create function public.project_chat_notify(p_message uuid) returns void language sql security definer set search_path='' as $$
 insert into public.app_notifications(user_id,kind,dedupe_key,title,message,chat_message_id)
 select cm.user_id,'project-chat','project-chat/'||m.id::text,'Новое сообщение в чате проекта','',m.id
 from public.project_chat_messages m join public.project_chats c on c.id=m.chat_id join public.project_chat_members cm on cm.chat_id=c.id
 where m.id=p_message and cm.user_id is distinct from m.author_id and not cm.muted and public.project_permission(cm.user_id,c.project_id) is not null
 on conflict(user_id,dedupe_key) do nothing;
$$;
create function public.project_chat_send_v2(p_actor uuid,p_project uuid,p_chat uuid,p_message uuid,p_data jsonb,p_files uuid[],p_passwords uuid[],p_mentions uuid[],p_poll_options uuid[],p_todo_items uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; result jsonb;
begin
 perform 1 from public.projects where id=p_project for update;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 if exists(select 1 from public.project_chat_messages where id=p_message) then return public.project_chat_send(p_actor,p_project,p_chat,p_message,p_data,p_files,p_passwords);end if;
 if cardinality(p_poll_options) not between 0 and 20 or cardinality(p_poll_options)=1 or cardinality(p_todo_items)>100 then raise exception 'INVALID_CHAT';end if;
 foreach target in array p_mentions loop
  if not exists(select 1 from public.project_chat_members where chat_id=p_chat and user_id=target) or public.project_permission(target,p_project) is null then raise exception 'USER_NOT_ELIGIBLE';end if;
 end loop;
 result:=public.project_chat_send(p_actor,p_project,p_chat,p_message,p_data,p_files,p_passwords);
 update public.project_chat_messages set mention_ids=p_mentions,poll_options=p_poll_options,todo_items=p_todo_items where id=p_message;
 perform public.project_chat_notify(p_message);
 return result;
end $$;
create function public.project_chat_message_change(p_actor uuid,p_project uuid,p_chat uuid,p_message uuid,p_revision integer,p_action text,p_data jsonb default null,p_mentions uuid[] default '{}') returns void language plpgsql security definer set search_path='' as $$
declare m public.project_chat_messages%rowtype; target uuid; attachments uuid[];
begin
 perform 1 from public.projects where id=p_project for update;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 select * into m from public.project_chat_messages where id=p_message and chat_id=p_chat for update;
 if not found or m.deleted_at is not null then raise exception 'MESSAGE_NOT_FOUND';end if;
 if p_action='edit' and m.author_id is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
 if p_action='delete' and m.author_id is distinct from p_actor and not exists(select 1 from public.project_chats where id=p_chat and created_by=p_actor) then raise exception 'ACCESS_DENIED';end if;
 if m.revision<>p_revision then raise exception 'REVISION_CONFLICT';end if;
 if p_action='edit' then
  foreach target in array p_mentions loop
   if not exists(select 1 from public.project_chat_members where chat_id=p_chat and user_id=target) or public.project_permission(target,p_project) is null then raise exception 'USER_NOT_ELIGIBLE';end if;
  end loop;
  update public.project_chat_messages set encrypted_data=p_data,mention_ids=p_mentions,edited_at=now(),revision=revision+1 where id=p_message;
 elsif p_action='delete' then
  update public.project_chat_messages set encrypted_data='{}',mention_ids='{}',deleted_at=now(),revision=revision+1 where id=p_message;
  delete from public.project_chat_pins where message_id=p_message;
  delete from public.project_chat_votes where message_id=p_message;
  delete from public.project_chat_todos where message_id=p_message;
  select coalesce(array_agg(file_id),'{}') into attachments from public.project_chat_message_files where message_id=p_message;
  delete from public.project_chat_message_files where message_id=p_message;
  delete from public.project_chat_files where id=any(attachments) and not exists(select 1 from public.project_chat_message_files where file_id=project_chat_files.id);
  delete from public.app_notifications where chat_message_id=p_message;
 else raise exception 'INVALID_CHAT';end if;
 perform public.project_chat_signal(p_chat);
end $$;
create function public.project_chat_interact(p_actor uuid,p_project uuid,p_chat uuid,p_message uuid,p_action text,p_item uuid default null,p_value boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare m public.project_chat_messages%rowtype;
begin
 perform 1 from public.projects where id=p_project for update;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 select * into m from public.project_chat_messages where id=p_message and chat_id=p_chat for update;
 if not found or m.deleted_at is not null then raise exception 'MESSAGE_NOT_FOUND';end if;
 if p_action='pin' then
  if p_value then insert into public.project_chat_pins(message_id,chat_id,pinned_by) values(p_message,p_chat,p_actor) on conflict do nothing;
  else delete from public.project_chat_pins where message_id=p_message;end if;
 elsif p_action='vote' then
  if m.poll_closed or cardinality(m.poll_options)=0 then raise exception 'POLL_CLOSED';end if;
  if p_item is null then delete from public.project_chat_votes where message_id=p_message and user_id=p_actor;
  elsif p_item=any(m.poll_options) then insert into public.project_chat_votes(message_id,user_id,option_id) values(p_message,p_actor,p_item) on conflict(message_id,user_id) do update set option_id=excluded.option_id;
  else raise exception 'INVALID_CHAT';end if;
 elsif p_action='close-poll' then
  if m.author_id is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
  if cardinality(m.poll_options)=0 then raise exception 'INVALID_CHAT';end if;
  update public.project_chat_messages set poll_closed=true where id=p_message;
 elsif p_action='todo' then
  if not(p_item=any(m.todo_items)) or p_item is null then raise exception 'INVALID_CHAT';end if;
  insert into public.project_chat_todos(message_id,item_id,done,updated_by) values(p_message,p_item,p_value,p_actor)
  on conflict(message_id,item_id) do update set done=excluded.done,updated_by=excluded.updated_by;
 else raise exception 'INVALID_CHAT';end if;
 perform public.project_chat_signal(p_chat);
end $$;
create function public.project_chat_preferences(p_actor uuid,p_project uuid,p_chat uuid,p_muted boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project for update;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 update public.project_chat_members set muted=p_muted where chat_id=p_chat and user_id=p_actor;
 if p_muted then update public.app_notifications n set read_at=coalesce(read_at,now()) from public.project_chat_messages m where n.chat_message_id=m.id and m.chat_id=p_chat and n.user_id=p_actor;end if;
end $$;
create function public.project_chat_notification_messages(p_actor uuid,p_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('notificationId',n.id,'projectId',c.project_id,'chatId',c.id,'chatName',c.name,'projectName',p.name,'message',public.project_chat_message_json(m.id))),'[]'::jsonb)
 from public.app_notifications n join public.project_chat_messages m on m.id=n.chat_message_id join public.project_chats c on c.id=m.chat_id join public.projects p on p.id=c.project_id
 where n.id=any(p_ids) and n.user_id=p_actor and n.dismissed_at is null and m.deleted_at is null
 and public.project_permission(p_actor,c.project_id) is not null and exists(select 1 from public.project_chat_members where chat_id=c.id and user_id=p_actor);
$$;
do $patch$ declare def text;begin
 select pg_get_functiondef('public.project_chat_list(uuid,uuid)'::regprocedure) into def;
 def:=replace(def,'''createdAt'',c.created_at', '''muted'',me.muted,''createdAt'',c.created_at');
 def:=replace(def,'seq>me.last_read_seq and author_id', 'seq>me.last_read_seq and deleted_at is null and author_id');
 execute def;
 select pg_get_functiondef('public.project_chat_mark_read(uuid,uuid,uuid,bigint)'::regprocedure) into def;
 if strpos(def,'last_read_seq<p_seq;')=0 then raise exception 'Unexpected chat read marker';end if;
 def:=replace(def,'last_read_seq<p_seq;', 'last_read_seq<p_seq; update public.app_notifications n set read_at=coalesce(n.read_at,now()) from public.project_chat_messages m where n.chat_message_id=m.id and n.user_id=p_actor and m.chat_id=p_chat and m.seq<=p_seq;');
 execute def;
end $patch$;
revoke all on function public.project_chat_message_json(uuid),public.project_chat_notify(uuid) from public,anon,authenticated,service_role;
revoke all on function public.project_chat_feed(uuid,uuid,uuid,bigint,boolean),public.project_chat_message_get(uuid,uuid,uuid,uuid),public.project_chat_send_v2(uuid,uuid,uuid,uuid,jsonb,uuid[],uuid[],uuid[],uuid[],uuid[]),public.project_chat_message_change(uuid,uuid,uuid,uuid,integer,text,jsonb,uuid[]),public.project_chat_interact(uuid,uuid,uuid,uuid,text,uuid,boolean),public.project_chat_preferences(uuid,uuid,uuid,boolean),public.project_chat_notification_messages(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.project_chat_feed(uuid,uuid,uuid,bigint,boolean),public.project_chat_message_get(uuid,uuid,uuid,uuid),public.project_chat_send_v2(uuid,uuid,uuid,uuid,jsonb,uuid[],uuid[],uuid[],uuid[],uuid[]),public.project_chat_message_change(uuid,uuid,uuid,uuid,integer,text,jsonb,uuid[]),public.project_chat_interact(uuid,uuid,uuid,uuid,text,uuid,boolean),public.project_chat_preferences(uuid,uuid,uuid,boolean),public.project_chat_notification_messages(uuid,uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
