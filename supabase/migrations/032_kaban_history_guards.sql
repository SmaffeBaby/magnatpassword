begin;
create or replace function public.kaban_category_mutate(p_actor uuid,p_board uuid,p_id text,p_revision integer,p_data jsonb,p_archive boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; affected uuid[];
begin
 perform public.kaban_check(p_actor,p_board,true);
 if p_archive is not null then
  select array_agg(distinct t.id) into affected from public.kaban_tasks t join public.kaban_task_locations l on l.task_id=t.id where l.board_id=p_board and l.category_ids && (array[p_id]||array(select id from public.kaban_categories where board_id=p_board and parent_id=p_id)) and (not p_archive or not t.archived);
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
create or replace function public.kaban_stages(p_actor uuid,p_board uuid,p_revision integer,p_stages jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform set_config('kaban.actor',p_actor::text,true);
 perform public.kaban_check(p_actor,p_board,true,true);
 if (select revision from public.kaban_boards where id=p_board)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 perform 1 from public.kaban_tasks t join public.kaban_task_locations l on l.task_id=t.id where l.board_id=p_board order by t.id for update of t;
 if exists(select 1 from public.kaban_task_locations where board_id=p_board and stage_id::text not in (select value->>'id' from jsonb_array_elements(p_stages))) then raise exception 'STAGE_IN_USE'; end if;
 if exists(select 1 from public.kaban_task_locations l join public.kaban_tasks t on t.id=l.task_id join public.kaban_boards b on b.id=l.board_id cross join lateral jsonb_array_elements(p_stages) s cross join lateral jsonb_array_elements(b.stages) old where l.board_id=p_board and s->>'id'=l.stage_id::text and old->>'id'=l.stage_id::text and (s->>'done')::boolean and not (old->>'done')::boolean and t.creator_id<>p_actor and not p_actor=any(t.closer_ids)) then raise exception 'CREATOR_COMPLETION_ONLY'; end if;
 update public.kaban_boards set stages=p_stages,revision=revision+1 where id=p_board;
end $$;

-- Capture deletion while all placements still exist, so every linked board keeps its history.
create function public.kaban_audit_task_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.kaban_boards where id=old.board_id) then
  insert into public.kaban_events(board_id,actor_id,entity,entity_id,task_id,action,category_ids,before_data)
  values(old.board_id,nullif(current_setting('kaban.actor',true),'')::uuid,'task',old.id::text,old.id,'DELETE',old.category_ids,to_jsonb(old));
 end if;
 return old;
end $$;
drop trigger kaban_tasks_audit on public.kaban_tasks;
create trigger kaban_tasks_audit after insert or update on public.kaban_tasks for each row execute function public.kaban_audit();
create trigger kaban_tasks_delete_audit before delete on public.kaban_tasks for each row execute function public.kaban_audit_task_delete();
revoke all on function public.kaban_audit_task_delete() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
