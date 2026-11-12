begin;
-- Publish the stage catalog before remapping task locations so audit metadata can resolve new IDs.
create or replace function public.kaban_category_stages_write(p_actor uuid,p_board uuid,p_category text,p_revision integer,p_stages jsonb,p_inherit boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare c public.kaban_categories%rowtype; old_defs jsonb; next_defs jsonb; id_map jsonb:='{}'; item jsonb; next_id text; target record; taskrow record; old_id text; new_id text; old_done boolean; new_done boolean; affected text[]:='{}'; actual jsonb; union_defs jsonb;
begin
 perform set_config('kaban.actor',p_actor::text,true);
 perform public.kaban_check(p_actor,p_board,true,true);
 perform 1 from public.kaban_boards where id=p_board for update;
 select * into c from public.kaban_categories where board_id=p_board and id=p_category for update;
 if not found or c.archived then raise exception 'INVALID_CATEGORY';end if;
 if c.revision<>p_revision then raise exception 'REVISION_CONFLICT';end if;
 old_defs:=public.kaban_category_stages(p_board,p_category);
 -- Descendants that still inherit this category follow the same change; independent children do not.
 with recursive descendants as (
  select id from public.kaban_categories where board_id=p_board and id=p_category
  union all select child.id from public.kaban_categories child join descendants parent on child.parent_id=parent.id where child.board_id=p_board and child.stages is null
 ) select array_agg(id) into affected from descendants;
 if p_inherit then
  next_defs:=case when c.parent_id is null then (select default_stages from public.kaban_boards where id=p_board) else public.kaban_category_stages(p_board,c.parent_id) end;
  for item in select value from jsonb_array_elements(old_defs) loop
   select s->>'id' into next_id from jsonb_array_elements(next_defs) with ordinality x(s,n) where s->>'id'=item->>'id' or (s->>'name'=item->>'name' and s->>'done'=item->>'done') order by (s->>'id'=item->>'id') desc,n limit 1;
   if next_id is not null then id_map:=id_map||jsonb_build_object(item->>'id',next_id);end if;
  end loop;
 else
  next_defs:='[]';
  for item in select value from jsonb_array_elements(p_stages) loop
   -- Existing independent stages keep their IDs; inherited IDs get private copies.
   next_id:=case when exists(select 1 from jsonb_array_elements(coalesce(c.stages,'[]')) s where s->>'id'=item->>'id') then item->>'id' else gen_random_uuid()::text end;
   id_map:=id_map||jsonb_build_object(item->>'id',next_id);
   next_defs:=next_defs||jsonb_build_array(item||jsonb_build_object('id',next_id));
  end loop;
 end if;
 -- The global catalog keeps old IDs for history and for independent category placements.
 select coalesce(jsonb_agg(s),'[]'::jsonb) into union_defs from public.kaban_boards b cross join lateral jsonb_array_elements(b.stages) s where b.id=p_board and not exists(select 1 from jsonb_array_elements(next_defs) n where n->>'id'=s->>'id');
 update public.kaban_boards set stages=union_defs||next_defs,revision=revision+1 where id=p_board;

 perform 1 from public.kaban_tasks t join public.kaban_task_locations l on l.task_id=t.id where l.board_id=p_board and l.category_ids&&affected order by t.id for update of t;
 for taskrow in select l.*,t.creator_id,t.closer_ids from public.kaban_task_locations l join public.kaban_tasks t on t.id=l.task_id where l.board_id=p_board and l.category_ids&&affected loop
  actual:=taskrow.category_stage_ids;
  foreach old_id in array taskrow.category_ids loop
   if not old_id=any(affected) then continue;end if;
   new_id:=coalesce(taskrow.category_stage_ids->>old_id,taskrow.stage_id::text);
   if not id_map ? new_id then raise exception 'STAGE_IN_USE';end if;
   select (s->>'done')::boolean into old_done from jsonb_array_elements(old_defs) s where s->>'id'=new_id;
   select (s->>'done')::boolean into new_done from jsonb_array_elements(next_defs) s where s->>'id'=id_map->>new_id;
   if new_done and not coalesce(old_done,false) and taskrow.creator_id<>p_actor and not p_actor=any(taskrow.closer_ids) then raise exception 'CREATOR_COMPLETION_ONLY';end if;
   actual:=actual||jsonb_build_object(old_id,id_map->>new_id);
  end loop;
  update public.kaban_task_locations set category_stage_ids=actual,stage_id=coalesce(actual->>category_ids[1],stage_id::text)::uuid where task_id=taskrow.task_id and board_id=p_board;
  update public.kaban_tasks set stage_id=case when board_id=p_board then (select stage_id from public.kaban_task_locations where board_id=p_board and task_id=taskrow.task_id) else stage_id end,revision=revision+1,updated_at=now() where id=taskrow.task_id;
 end loop;
 update public.kaban_categories set stages=case when p_inherit then null else next_defs end,revision=revision+1 where board_id=p_board and id=p_category;
end $$;

notify pgrst,'reload schema';
commit;
