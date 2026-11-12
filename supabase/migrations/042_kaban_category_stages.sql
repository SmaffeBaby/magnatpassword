begin;
alter table public.kaban_boards add column default_stages jsonb;
update public.kaban_boards set default_stages=stages;
alter table public.kaban_boards alter column default_stages set not null;
alter table public.kaban_categories add column stages jsonb;
alter table public.kaban_task_locations add column category_stage_ids jsonb not null default '{}'::jsonb;
update public.kaban_task_locations l set category_stage_ids=(select coalesce(jsonb_object_agg(c,l.stage_id::text),'{}'::jsonb) from unnest(l.category_ids) c);
-- New boards retain their existing default stage initialization.
create function public.kaban_default_stages_init() returns trigger language plpgsql set search_path='' as $$
begin if new.default_stages is null then new.default_stages:=new.stages;end if;return new;end $$;
create trigger kaban_default_stages_init before insert on public.kaban_boards for each row execute function public.kaban_default_stages_init();

create function public.kaban_category_stages(p_board uuid,p_category text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.kaban_categories%rowtype; seen text[]:='{}'; current_id text:=p_category;
begin
 while current_id is not null loop
  if current_id=any(seen) then raise exception 'INVALID_CATEGORY';end if;
  seen:=seen||current_id;
  select * into c from public.kaban_categories where board_id=p_board and id=current_id;
  if not found then raise exception 'INVALID_CATEGORY';end if;
  if c.stages is not null then return c.stages;end if;
  current_id:=c.parent_id;
 end loop;
 return (select default_stages from public.kaban_boards where id=p_board);
end $$;

alter function public.kaban_load(uuid,uuid) rename to kaban_load_v41;
create function public.kaban_load(p_actor uuid,p_vault uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare data jsonb; b uuid;
begin
 data:=public.kaban_load_v41(p_actor,p_vault);b:=(data->'board'->>'id')::uuid;
 return data||jsonb_build_object('board',(data->'board')||jsonb_build_object('defaultStages',(select default_stages from public.kaban_boards where id=b)),
 'tasks',(select coalesce(jsonb_agg(t||jsonb_build_object('category_stage_ids',(select category_stage_ids from public.kaban_task_locations where board_id=b and task_id=(t->>'id')::uuid))),'[]'::jsonb) from jsonb_array_elements(data->'tasks') t),
 'categories',(select coalesce(jsonb_agg(c||jsonb_build_object('effectiveStages',public.kaban_category_stages(b,c->>'id'),'stages',(select stages from public.kaban_categories where board_id=b and id=c->>'id'))),'[]'::jsonb) from jsonb_array_elements(data->'categories') c));
end $$;

-- Keep a stage for each category, including when older clients add or remove category labels.
create function public.kaban_location_stage_map() returns trigger language plpgsql set search_path='' as $$
begin
 new.category_stage_ids:=(select coalesce(jsonb_object_agg(c,coalesce(new.category_stage_ids->>c,new.stage_id::text)),'{}'::jsonb) from unnest(new.category_ids) c);
 return new;
end $$;
create trigger kaban_location_stage_map before insert or update on public.kaban_task_locations for each row execute function public.kaban_location_stage_map();

alter function public.kaban_task_mutate(uuid,uuid,uuid,integer,jsonb,boolean) rename to kaban_task_mutate_v41;
create function public.kaban_task_mutate(p_actor uuid,p_board uuid,p_id uuid,p_revision integer,p_payload jsonb,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare scope text; defs jsonb; l public.kaban_task_locations%rowtype; result jsonb; patched jsonb; saved_map jsonb;
begin
 perform public.kaban_check(p_actor,p_board,true);
 -- Match the lock order used by stage editors: board, then tasks.
 perform 1 from public.kaban_boards where id=p_board for update;
 perform 1 from public.kaban_tasks where id=p_id for update;
 select * into l from public.kaban_task_locations where board_id=p_board and task_id=p_id;
 if p_delete or p_payload ? 'archive' then return public.kaban_task_mutate_v41(p_actor,p_board,p_id,p_revision,p_payload,p_delete);end if;
 scope:=coalesce(p_payload->>'scopeCategoryId',p_payload->'categoryIds'->>0);
 if scope is null or not (p_payload->'categoryIds' ? scope) then raise exception 'INVALID_CATEGORY';end if;
 defs:=public.kaban_category_stages(p_board,scope);
 if not exists(select 1 from jsonb_array_elements(defs) s where s->>'id'=p_payload->>'stageId') then raise exception 'INVALID_STAGE';end if;
 -- The existing mutation still validates permissions, revisions, participants, completion and audit data.
 -- Give it the previous stage in this category rather than the last stage edited elsewhere.
 if l.task_id is not null then
  saved_map:=l.category_stage_ids;
  update public.kaban_task_locations set stage_id=coalesce(category_stage_ids->>scope,stage_id::text)::uuid where board_id=p_board and task_id=p_id;
 end if;
 result:=public.kaban_task_mutate_v41(p_actor,p_board,p_id,p_revision,p_payload,p_delete);
 update public.kaban_task_locations set category_stage_ids=coalesce(saved_map,'{}'::jsonb)||jsonb_build_object(scope,p_payload->>'stageId') where board_id=p_board and task_id=p_id;
 return result;
end $$;

create function public.kaban_category_stages_write(p_actor uuid,p_board uuid,p_category text,p_revision integer,p_stages jsonb,p_inherit boolean default false)
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
  update public.kaban_tasks set revision=revision+1,updated_at=now() where id=taskrow.task_id;
 end loop;
 update public.kaban_categories set stages=case when p_inherit then null else next_defs end,revision=revision+1 where board_id=p_board and id=p_category;
 -- The global catalog keeps old IDs for history and for independent category placements.
 select coalesce(jsonb_agg(s),'[]'::jsonb) into union_defs from public.kaban_boards b cross join lateral jsonb_array_elements(b.stages) s where b.id=p_board and not exists(select 1 from jsonb_array_elements(next_defs) n where n->>'id'=s->>'id');
 update public.kaban_boards set stages=union_defs||next_defs,revision=revision+1 where id=p_board;
end $$;

-- Editing the board defaults never removes or modifies a category's private stages.
create or replace function public.kaban_stages(p_actor uuid,p_board uuid,p_revision integer,p_stages jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare old_defs jsonb; catalog jsonb;
begin
 perform set_config('kaban.actor',p_actor::text,true);
 perform public.kaban_check(p_actor,p_board,true,true);
 perform 1 from public.kaban_boards where id=p_board for update;
 if (select revision from public.kaban_boards where id=p_board)<>p_revision then raise exception 'REVISION_CONFLICT';end if;
 select default_stages into old_defs from public.kaban_boards where id=p_board;
 -- Default IDs are private to defaults. A client cannot smuggle an unrelated category stage into them.
 if exists(select 1 from jsonb_array_elements(p_stages) s join public.kaban_boards b on b.id=p_board where exists(select 1 from jsonb_array_elements(b.stages) x where x->>'id'=s->>'id') and not exists(select 1 from jsonb_array_elements(old_defs) x where x->>'id'=s->>'id')) then raise exception 'INVALID_STAGE';end if;
 perform 1 from public.kaban_tasks t join public.kaban_task_locations l on l.task_id=t.id where l.board_id=p_board order by t.id for update of t;
 if exists(select 1 from public.kaban_task_locations l cross join lateral jsonb_each_text(l.category_stage_ids) m cross join lateral jsonb_array_elements(old_defs) old where l.board_id=p_board and old->>'id'=m.value and not exists(select 1 from jsonb_array_elements(p_stages) n where n->>'id'=m.value)) then raise exception 'STAGE_IN_USE';end if;
 if exists(select 1 from public.kaban_task_locations l join public.kaban_tasks t on t.id=l.task_id cross join lateral jsonb_each_text(l.category_stage_ids) m cross join lateral jsonb_array_elements(old_defs) old cross join lateral jsonb_array_elements(p_stages) n where l.board_id=p_board and old->>'id'=m.value and n->>'id'=m.value and (n->>'done')::boolean and not (old->>'done')::boolean and t.creator_id<>p_actor and not p_actor=any(t.closer_ids)) then raise exception 'CREATOR_COMPLETION_ONLY';end if;
 select coalesce(jsonb_agg(s),'[]'::jsonb) into catalog from public.kaban_boards b cross join lateral jsonb_array_elements(b.stages) s where b.id=p_board and not exists(select 1 from jsonb_array_elements(old_defs) o where o->>'id'=s->>'id');
 update public.kaban_boards set default_stages=p_stages,stages=p_stages||catalog,revision=revision+1 where id=p_board;
end $$;
-- Validate placements against their target categories, then seed their independent stage maps.
alter function public.kaban_task_place(uuid,uuid,uuid,uuid,integer,uuid,text[],boolean) rename to kaban_task_place_v41;
create function public.kaban_task_place(p_actor uuid,p_task uuid,p_source uuid,p_target uuid,p_revision integer,p_stage uuid,p_categories text[],p_move boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; cat text;
begin
 perform public.kaban_check(p_actor,p_source,true);perform public.kaban_check(p_actor,p_target,true);
 perform 1 from public.kaban_boards where id in(p_source,p_target) order by id for update;
 foreach cat in array p_categories loop
  if not exists(select 1 from jsonb_array_elements(public.kaban_category_stages(p_target,cat)) s where s->>'id'=p_stage::text) then raise exception 'INVALID_STAGE';end if;
 end loop;
 result:=public.kaban_task_place_v41(p_actor,p_task,p_source,p_target,p_revision,p_stage,p_categories,p_move);
 update public.kaban_task_locations set category_stage_ids=(select jsonb_object_agg(c,p_stage::text) from unnest(p_categories) c) where task_id=p_task and board_id=p_target;
 return result;
end $$;
-- Reparenting an inherited category with tasks must not silently change their stage definitions.
alter function public.kaban_category_mutate(uuid,uuid,text,integer,jsonb,boolean) rename to kaban_category_mutate_v41;
create function public.kaban_category_mutate(p_actor uuid,p_board uuid,p_id text,p_revision integer,p_data jsonb,p_archive boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.kaban_categories%rowtype; affected text[];
begin
 perform public.kaban_check(p_actor,p_board,true);
 perform 1 from public.kaban_boards where id=p_board for update;
 select * into c from public.kaban_categories where board_id=p_board and id=p_id;
 if p_archive is null and c.id is not null and c.stages is null and c.parent_id is distinct from p_data->>'parentId' then
  with recursive children as (select c.id as id union all select x.id from public.kaban_categories x join children p on x.parent_id=p.id where x.board_id=p_board and x.stages is null) select array_agg(id) into affected from children;
  if exists(select 1 from public.kaban_task_locations where board_id=p_board and category_ids&&affected) then raise exception 'CATEGORY_STAGES_IN_USE';end if;
 end if;
 return public.kaban_category_mutate_v41(p_actor,p_board,p_id,p_revision,p_data,p_archive);
end $$;
revoke all on function public.kaban_task_place(uuid,uuid,uuid,uuid,integer,uuid,text[],boolean),public.kaban_category_mutate(uuid,uuid,text,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.kaban_task_place(uuid,uuid,uuid,uuid,integer,uuid,text[],boolean),public.kaban_category_mutate(uuid,uuid,text,integer,jsonb,boolean) to service_role;

revoke all on function public.kaban_default_stages_init(),public.kaban_category_stages(uuid,text),public.kaban_load(uuid,uuid),public.kaban_location_stage_map(),public.kaban_task_mutate(uuid,uuid,uuid,integer,jsonb,boolean),public.kaban_category_stages_write(uuid,uuid,text,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.kaban_category_stages(uuid,text),public.kaban_load(uuid,uuid),public.kaban_task_mutate(uuid,uuid,uuid,integer,jsonb,boolean),public.kaban_category_stages_write(uuid,uuid,text,integer,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
