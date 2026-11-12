begin;
-- All structural writes lock the board before task rows, including copying tasks with files.
alter function public.kaban_copy_task(uuid,uuid,uuid,integer,uuid,jsonb,jsonb) rename to kaban_copy_task_v45;
create function public.kaban_copy_task(p_actor uuid,p_source uuid,p_task uuid,p_revision integer,p_new uuid,p_payload jsonb,p_files jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.kaban_check(p_actor,p_source,true);
 perform 1 from public.kaban_boards where id=p_source for update;
 perform public.kaban_copy_task_v45(p_actor,p_source,p_task,p_revision,p_new,p_payload,p_files);
end $$;
revoke all on function public.kaban_copy_task(uuid,uuid,uuid,integer,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kaban_copy_task(uuid,uuid,uuid,integer,uuid,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
