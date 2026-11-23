begin;

alter table public.project_chat_messages add column activity jsonb;

-- Chat actions share the message sequence and commit with the change that produced them.
create function public.project_chat_add_activity(p_chat uuid,p_actor uuid,p_activity jsonb)
returns void language sql security definer set search_path='' as $$
  insert into public.project_chat_messages(id,chat_id,author_id,encrypted_data,activity)
  values(gen_random_uuid(),p_chat,p_actor,'{}',p_activity);
  update public.project_chats set updated_at=now() where id=p_chat;
$$;
revoke all on function public.project_chat_add_activity(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.project_chat_manage(p_actor uuid,p_project uuid,p_chat uuid,p_revision integer,p_name text,p_members uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.project_chats%rowtype; member uuid; previous_members uuid[]; joined uuid[]; removed uuid[];
begin
 if p_project is null then raise exception 'ACCESS_DENIED';end if;
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
  select coalesce(array_agg(user_id order by user_id),'{}') into previous_members
  from public.project_chat_members where chat_id=p_chat;
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
 if p_revision=0 then
  perform public.project_chat_add_activity(p_chat,p_actor,jsonb_build_object('kind','created'));
 else
  if c.name is distinct from btrim(p_name) then
   perform public.project_chat_add_activity(p_chat,p_actor,jsonb_build_object('kind','renamed','name',btrim(p_name)));
  end if;
  joined:=array(select user_id from public.project_chat_members where chat_id=p_chat and not(user_id=any(previous_members)) order by user_id);
  removed:=array(select unnest(previous_members) except select user_id from public.project_chat_members where chat_id=p_chat order by 1);
  if cardinality(joined)>0 then
   perform public.project_chat_add_activity(p_chat,p_actor,jsonb_build_object('kind','members-added','memberIds',joined));
  end if;
  if cardinality(removed)>0 then
   perform public.project_chat_add_activity(p_chat,p_actor,jsonb_build_object('kind','members-removed','memberIds',removed));
  end if;
 end if;
 perform public.project_chat_signal(p_chat);
 return jsonb_build_object('id',p_chat);
end $$;

create or replace function public.project_chat_interact(p_actor uuid,p_project uuid,p_chat uuid,p_message uuid,p_action text,p_item uuid default null,p_value boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare m public.project_chat_messages%rowtype;
begin
 perform 1 from public.projects where id=p_project for update;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 select * into m from public.project_chat_messages where id=p_message and chat_id=p_chat for update;
 if not found or m.deleted_at is not null or m.activity is not null then raise exception 'MESSAGE_NOT_FOUND';end if;
 if p_action='pin' then
  if p_value then
   insert into public.project_chat_pins(message_id,chat_id,pinned_by) values(p_message,p_chat,p_actor) on conflict do nothing;
  else
   delete from public.project_chat_pins where message_id=p_message;
  end if;
  if found then
   perform public.project_chat_add_activity(p_chat,p_actor,jsonb_build_object('kind',case when p_value then 'pinned' else 'unpinned' end,'messageSeq',m.seq));
  end if;
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

create or replace function public.project_chat_set_avatar(p_actor uuid, p_project uuid, p_chat uuid, p_revision integer, p_avatar text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  chat public.project_chats%rowtype;
begin
  if p_project is null then raise exception 'ACCESS_DENIED'; end if;
  perform 1 from public.projects where id = p_project for share;
  select * into chat from public.project_chats where id = p_chat and project_id = p_project for update;
  perform public.project_chat_check(p_actor, p_project, p_chat);
  if chat.created_by is distinct from p_actor then raise exception 'ACCESS_DENIED'; end if;
  if chat.revision <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
  update public.project_chats set avatar = p_avatar, revision = revision + 1 where id = p_chat;
  if chat.avatar is distinct from p_avatar then
    perform public.project_chat_add_activity(p_chat,p_actor,jsonb_build_object('kind',case when p_avatar='' then 'avatar-removed' else 'avatar-changed' end));
  end if;
  perform public.project_chat_signal(p_chat);
end $$;

-- Keep service entries out of ordinary message mutations, forwarding and bulk selection.
do $patch$
declare operation record; definition text;
begin
 for operation in select * from (values
  ('public.project_chat_message_json(uuid)', '''encryptedData'',m.encrypted_data', '''encryptedData'',m.encrypted_data,''activity'',m.activity'),
  ('public.project_chat_message_get(uuid,uuid,uuid,uuid)', 'where id=p_message and chat_id=p_chat)', 'where id=p_message and chat_id=p_chat and activity is null)'),
  ('public.project_chat_message_change(uuid,uuid,uuid,uuid,integer,text,jsonb,uuid[])', 'if not found or m.deleted_at is not null then', 'if not found or m.deleted_at is not null or m.activity is not null then'),
  ('public.chat_selectable(uuid,uuid,uuid)', 'and deleted_at is null)', 'and deleted_at is null and activity is null)'),
  ('public.chat_forward_send(uuid,uuid,uuid,uuid,integer,uuid,uuid,uuid,jsonb,uuid[],uuid[],uuid[])', 'and deleted_at is null)', 'and deleted_at is null and activity is null)'),
  ('public.chat_directory_previews(uuid)', 'and deleted_at is null order by', 'and deleted_at is null and activity is null order by')
 ) as changes(signature,old_text,new_text) loop
  select pg_get_functiondef(operation.signature::regprocedure) into definition;
  if strpos(definition,operation.old_text)=0 then raise exception 'Unexpected chat function: %',operation.signature;end if;
  execute replace(definition,operation.old_text,operation.new_text);
 end loop;
end $patch$;

notify pgrst,'reload schema';
commit;
