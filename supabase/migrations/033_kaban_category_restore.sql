begin;
create or replace function public.kaban_category_mutate(p_actor uuid,p_board uuid,p_id text,p_revision integer,p_data jsonb,p_archive boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; affected uuid[];
begin
 perform public.kaban_check(p_actor,p_board,true);
 if p_archive is not null then
  select array_agg(distinct t.id) into affected from public.kaban_tasks t join public.kaban_task_locations l on l.task_id=t.id where l.board_id=p_board and l.category_ids && (array[p_id]||array(select id from public.kaban_categories where board_id=p_board and parent_id=p_id)) and ((p_archive and not t.archived) or (not p_archive and t.archive_root=p_id));
  perform 1 from public.kaban_tasks where id=any(affected) order by id for update;
  if exists(select 1 from public.kaban_tasks where id=any(affected) and creator_id<>p_actor and not p_actor=any(closer_ids)) then raise exception 'CREATOR_COMPLETION_ONLY'; end if;
 end if;
 result:=public.kaban_category_mutate_v30(p_actor,p_board,p_id,p_revision,p_data,p_archive);
 if p_archive then
  update public.kaban_tasks set archived=true,archive_root=p_id,revision=revision+1,updated_at=now() where id=any(affected) and not archived;
 elsif p_archive=false then
  update public.kaban_tasks set archived=false,archive_root=null,revision=revision+1,updated_at=now() where id=any(affected) and archive_root=p_id;
 end if;
 return result;
end $$;
notify pgrst,'reload schema';
commit;
