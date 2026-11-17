begin;
create table public.chat_typing (
 chat_id uuid not null references public.project_chats(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null,
 primary key(chat_id,user_id)
);
alter table public.chat_typing enable row level security;
revoke all on public.chat_typing from public,anon,authenticated;
create function public.chat_typing_set(p_actor uuid,p_project uuid,p_chat uuid,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project for share;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 if p_active then
  insert into public.chat_typing(chat_id,user_id,expires_at) values(p_chat,p_actor,clock_timestamp()+interval '7 seconds')
  on conflict(chat_id,user_id) do update set expires_at=excluded.expires_at;
 else delete from public.chat_typing where chat_id=p_chat and user_id=p_actor;
 end if;
 perform public.project_chat_signal(p_chat);
end $$;
create function public.chat_typing_get(p_actor uuid,p_project uuid,p_chat uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project for share;
 perform public.project_chat_check(p_actor,p_project,p_chat);
 return coalesce((select jsonb_agg(t.user_id order by t.user_id) from public.chat_typing t
 join public.project_chat_members m on m.chat_id=t.chat_id and m.user_id=t.user_id
 where t.chat_id=p_chat and t.user_id<>p_actor and t.expires_at>clock_timestamp() and public.chat_scope_member(t.user_id,p_project)),'[]'::jsonb);
end $$;
revoke all on function public.chat_typing_set(uuid,uuid,uuid,boolean),public.chat_typing_get(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.chat_typing_set(uuid,uuid,uuid,boolean),public.chat_typing_get(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
