begin;
-- Deleted rows retain only receipt/idempotency metadata; they never appear in the feed.
do $patch$ declare def text;begin
 select pg_get_functiondef('public.project_chat_feed(uuid,uuid,uuid,bigint,boolean)'::regprocedure) into def;
 if strpos(def,'where m.chat_id=p_chat and')=0 then raise exception 'Unexpected chat feed';end if;
 def:=replace(def,'where m.chat_id=p_chat and','where m.chat_id=p_chat and m.deleted_at is null and');
 execute def;
 select pg_get_functiondef('public.project_chat_message_change(uuid,uuid,uuid,uuid,integer,text,jsonb,uuid[])'::regprocedure) into def;
 if strpos(def,'and not exists(select 1 from public.project_chats where id=p_chat and created_by=p_actor)')=0 then raise exception 'Unexpected chat deletion guard';end if;
 def:=replace(def,' and not exists(select 1 from public.project_chats where id=p_chat and created_by=p_actor)','');
 def:=replace(def,' perform public.project_chat_signal(p_chat);', ' if current_setting(''magnat.chat_bulk'',true) is distinct from ''on'' then perform public.project_chat_signal(p_chat);end if;');
 execute def;
end $patch$;
create function public.project_chat_delete_many(p_actor uuid,p_project uuid,p_chat uuid,p_messages jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; m public.project_chat_messages%rowtype; total integer:=0;
begin
 perform 1 from public.projects where id=p_project for update;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 if jsonb_typeof(p_messages)<>'array' or jsonb_array_length(p_messages) not between 1 and 5000 then raise exception 'INVALID_CHAT';end if;
 -- Validate the complete selection before deleting anything.
 for item in select value from jsonb_array_elements(p_messages) loop
  select * into m from public.project_chat_messages where id=(item->>'id')::uuid and chat_id=p_chat;
  if not found or m.deleted_at is not null then raise exception 'MESSAGE_NOT_FOUND';end if;
  if m.author_id is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
  if m.revision is distinct from (item->>'revision')::integer then raise exception 'REVISION_CONFLICT';end if;
 end loop;
 perform set_config('magnat.chat_bulk','on',true);
 for item in select value from jsonb_array_elements(p_messages) loop
  perform public.project_chat_message_change(p_actor,p_project,p_chat,(item->>'id')::uuid,(item->>'revision')::integer,'delete');
  total:=total+1;
 end loop;
 perform set_config('magnat.chat_bulk','off',true);
 perform public.project_chat_signal(p_chat);
 return jsonb_build_object('deleted',total);
end $$;
revoke all on function public.project_chat_delete_many(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.project_chat_delete_many(uuid,uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
