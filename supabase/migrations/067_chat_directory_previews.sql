begin;
create function public.chat_directory_previews(p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('chatId',c.id,'id',latest.id,'authorId',latest.author_id,'encryptedData',latest.encrypted_data)),'[]'::jsonb)
 from public.project_chats c
 join public.project_chat_members me on me.chat_id=c.id and me.user_id=p_actor
 cross join lateral (
  select id,author_id,encrypted_data from public.project_chat_messages
  where chat_id=c.id and deleted_at is null order by seq desc limit 1
 ) latest
 where c.project_id is null and public.chat_scope_member(p_actor,null);
$$;
revoke all on function public.chat_directory_previews(uuid) from public,anon,authenticated;
grant execute on function public.chat_directory_previews(uuid) to service_role;
notify pgrst,'reload schema';
commit;
