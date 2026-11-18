begin;
create function public.space_topic_visible(p_topic text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_spaces s where p_topic='space-cursors:'||s.id::text and public.project_permission(auth.uid(),s.project_id) is not null)
$$;
revoke all on function public.space_topic_visible(text) from public,anon;
grant execute on function public.space_topic_visible(text) to authenticated;
create policy space_cursor_receive on realtime.messages for select to authenticated using(extension='broadcast' and public.space_topic_visible(realtime.topic()));
create policy space_cursor_send on realtime.messages for insert to authenticated with check(extension='broadcast' and public.space_topic_visible(realtime.topic()));
commit;
