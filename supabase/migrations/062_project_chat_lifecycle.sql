begin;
-- BEFORE DELETE triggers must return OLD to allow the project deletion to proceed.
create or replace function public.project_chat_project_live() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; extra uuid; chat uuid;
begin
 if tg_table_name='projects' then target:=old.id;
 elsif tg_op='DELETE' then target:=old.project_id;extra:=old.user_id;
 else target:=new.project_id;extra:=new.user_id;end if;
 for chat in select id from public.project_chats where project_id=target order by id loop perform public.project_chat_signal(chat,extra);end loop;
 if tg_table_name='projects' then return old;end if;
 return null;
end $$;
-- Acquire live-row locks in a consistent order for users shared by multiple projects.
create or replace function public.project_chat_signal(p_chat uuid,p_extra uuid default null) returns void language sql security definer set search_path='' as $$
 insert into public.project_chat_live(user_id)
 select distinct user_id from (select user_id from public.project_chat_members where chat_id=p_chat union select p_extra where p_extra is not null) u
 where exists(select 1 from auth.users where id=u.user_id) order by user_id
 on conflict(user_id) do update set token=gen_random_uuid();
$$;
notify pgrst,'reload schema';
commit;
