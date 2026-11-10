begin;
alter table public.kaban_tasks add column closer_ids uuid[] not null default '{}';
create table public.kaban_task_locations (
 task_id uuid not null references public.kaban_tasks(id) on delete cascade,
 board_id uuid not null references public.kaban_boards(id) on delete cascade,
 stage_id uuid not null, category_ids text[] not null,
 primary key(task_id,board_id)
);
create index kaban_locations_board on public.kaban_task_locations(board_id);
alter table public.kaban_task_locations enable row level security;
revoke all on public.kaban_task_locations from public,anon,authenticated;
grant all on public.kaban_task_locations to service_role;
insert into public.kaban_task_locations select id,board_id,stage_id,category_ids from public.kaban_tasks;
-- The task is stored once. Each board has its own stage and category placement.
create function public.kaban_sync_location() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.kaban_task_locations(task_id,board_id,stage_id,category_ids) values(new.id,new.board_id,new.stage_id,new.category_ids)
 on conflict(task_id,board_id) do update set stage_id=excluded.stage_id,category_ids=excluded.category_ids;
 return null;
end $$;
create trigger kaban_tasks_locations after insert or update of board_id,stage_id,category_ids on public.kaban_tasks for each row execute function public.kaban_sync_location();

create function public.kaban_location_allowed(p_actor uuid,p_board uuid,p_categories text[],p_write boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kaban_boards b where b.id=p_board and
 ((b.vault_id is null and b.owner_id=p_actor) or exists(select 1 from public.shared_vault_members m where m.vault_id=b.vault_id and m.user_id=p_actor and (not p_write or m.member_role<>'viewer') and public.kaban_task_visible(b.id,p_categories,m.category_ids))));
$$;
create function public.kaban_task_access(p_actor uuid,p_task uuid,p_write boolean default false,p_board uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.kaban_task_locations%rowtype; t public.kaban_tasks%rowtype;
begin
 select * into t from public.kaban_tasks where id=p_task;
 if not found then raise exception 'KABAN_NOT_FOUND'; end if;
 select * into l from public.kaban_task_locations where task_id=p_task and (p_board is null or board_id=p_board) and public.kaban_location_allowed(p_actor,board_id,category_ids,p_write) order by board_id limit 1;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 return to_jsonb(t)||jsonb_build_object('board_id',l.board_id,'stage_id',l.stage_id,'category_ids',l.category_ids);
end $$;
create or replace function public.kaban_load(p_actor uuid,p_vault uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.kaban_boards%rowtype; rights jsonb; categories text[];
begin
 if p_vault is not null and not exists(select 1 from public.shared_vault_members where vault_id=p_vault and user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 insert into public.kaban_boards(owner_id,vault_id) values(p_actor,p_vault) on conflict do nothing;
 select * into b from public.kaban_boards where (p_vault is null and vault_id is null and owner_id=p_actor) or (p_vault is not null and vault_id=p_vault);
 rights:=public.kaban_check(p_actor,b.id);
 if jsonb_typeof(rights->'categoryIds')='array' then categories:=array(select jsonb_array_elements_text(rights->'categoryIds')); end if;
 return rights||jsonb_build_object('board',jsonb_build_object('id',b.id,'vaultId',b.vault_id,'revision',b.revision,'stages',b.stages),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'parentId',parent_id,'color',color,'archived',archived,'revision',revision,'archiveRoot',archive_root,'legacyId',legacy_id)) from public.kaban_categories where board_id=b.id and public.kaban_category_visible(b.id,id,categories)),'[]'::jsonb),
 'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('board_id',l.board_id,'stage_id',l.stage_id,'category_ids',l.category_ids,
 'file_count',(select count(*) from public.kaban_files where task_id=t.id),
 'locations',coalesce((select jsonb_agg(jsonb_build_object('boardId',x.board_id,'vaultId',xb.vault_id)) from public.kaban_task_locations x join public.kaban_boards xb on xb.id=x.board_id where x.task_id=t.id and public.kaban_location_allowed(p_actor,x.board_id,x.category_ids)),'[]'::jsonb)) order by t.created_at desc)
 from public.kaban_task_locations l join public.kaban_tasks t on t.id=l.task_id where l.board_id=b.id and public.kaban_task_visible(b.id,l.category_ids,categories)),'[]'::jsonb));
end $$;

create or replace function public.kaban_task_mutate(p_actor uuid,p_board uuid,p_id uuid,p_revision integer,p_payload jsonb,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rights jsonb; b public.kaban_boards%rowtype; t public.kaban_tasks%rowtype; l public.kaban_task_locations%rowtype; categories text[]; targets uuid[]; closers uuid[]; next_categories text[]; files jsonb; done_before boolean; done_after boolean;
begin
 perform set_config('kaban.actor',p_actor::text,true);
 rights:=public.kaban_check(p_actor,p_board,true);
 select * into b from public.kaban_boards where id=p_board;
 if jsonb_typeof(rights->'categoryIds')='array' then categories:=array(select jsonb_array_elements_text(rights->'categoryIds')); end if;
 select * into t from public.kaban_tasks where id=p_id for update;
 select * into l from public.kaban_task_locations where task_id=p_id and board_id=p_board;
 if p_revision>0 and t.id is null then raise exception 'KABAN_NOT_FOUND'; end if;
 if t.id is not null and (l.task_id is null or not public.kaban_task_visible(p_board,l.category_ids,categories)) then raise exception 'ACCESS_DENIED'; end if;
 if coalesce(t.revision,0)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if p_payload ? 'archive' then
  if t.id is null then raise exception 'KABAN_NOT_FOUND'; end if;
  if t.creator_id<>p_actor and not p_actor=any(t.closer_ids) then raise exception 'CREATOR_COMPLETION_ONLY'; end if;
  if not (p_payload->>'archive')::boolean and exists(select 1 from public.kaban_task_locations x join public.kaban_categories c on c.board_id=x.board_id and c.id=any(x.category_ids) where x.task_id=p_id and c.archived) then raise exception 'CATEGORY_ARCHIVED'; end if;
  update public.kaban_tasks set archived=(p_payload->>'archive')::boolean,archive_root=null,revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('ok',true);
 end if;
 if p_delete then
  if t.id is null then raise exception 'KABAN_NOT_FOUND'; end if;
  if t.creator_id<>p_actor then raise exception 'CREATOR_ONLY'; end if;
  select coalesce(jsonb_agg(id),'[]'::jsonb) into files from public.kaban_files where task_id=p_id;
  delete from public.kaban_tasks where id=p_id;
  return jsonb_build_object('deleted',true,'files',files);
 end if;
 select (value->>'done')::boolean into done_after from jsonb_array_elements(b.stages) where value->>'id'=p_payload->>'stageId';
 if not found then raise exception 'INVALID_STAGE'; end if;
 select (value->>'done')::boolean into done_before from jsonb_array_elements(b.stages) where value->>'id'=l.stage_id::text;
 if done_after and not coalesce(done_before,false) and t.id is not null and t.creator_id<>p_actor and not p_actor=any(t.closer_ids) then raise exception 'CREATOR_COMPLETION_ONLY'; end if;
 targets:=array(select value::uuid from jsonb_array_elements_text(p_payload->'participantIds'));
 closers:=case when p_payload ? 'closerIds' then array(select value::uuid from jsonb_array_elements_text(p_payload->'closerIds')) else coalesce(t.closer_ids,'{}') end;
 if t.id is not null and t.creator_id<>p_actor and (not (targets @> t.participant_ids and targets <@ t.participant_ids) or not (closers @> t.closer_ids and closers <@ t.closer_ids)) then raise exception 'CREATOR_ONLY'; end if;
 next_categories:=array(select jsonb_array_elements_text(p_payload->'categoryIds'));
 if cardinality(next_categories)=0 or exists(select 1 from unnest(next_categories) c where not exists(select 1 from public.kaban_categories where board_id=p_board and id=c and not archived) or not public.kaban_category_visible(p_board,c,categories)) then raise exception 'INVALID_CATEGORY'; end if;
 -- Existing assignments survive a move even if the creator needs to revise them afterwards.
 if t.id is null or targets<>t.participant_ids or closers<>t.closer_ids then
  if exists(select 1 from unnest(targets||closers) u where not (b.vault_id is null and u=p_actor) and not exists(select 1 from public.shared_vault_members m where m.vault_id=b.vault_id and m.user_id=u and public.kaban_task_visible(p_board,next_categories,m.category_ids)) and not exists(select 1 from public.kaban_task_locations x where x.task_id=p_id and public.kaban_location_allowed(u,x.board_id,x.category_ids))) then raise exception 'INVALID_PARTICIPANT'; end if;
 end if;
 if t.id is null then
  if (select count(*) from public.kaban_task_locations where board_id=p_board)>=5000 then raise exception 'TASK_LIMIT'; end if;
  insert into public.kaban_tasks(id,board_id,creator_id,stage_id,participant_ids,closer_ids,category_ids,encrypted_data) values(p_id,p_board,p_actor,(p_payload->>'stageId')::uuid,targets,closers,next_categories,p_payload->'encryptedData');
 else
  update public.kaban_tasks set stage_id=case when board_id=p_board then (p_payload->>'stageId')::uuid else stage_id end,category_ids=case when board_id=p_board then next_categories else category_ids end,participant_ids=targets,closer_ids=closers,encrypted_data=p_payload->'encryptedData',revision=revision+1,updated_at=now() where id=p_id;
  update public.kaban_task_locations set stage_id=(p_payload->>'stageId')::uuid,category_ids=next_categories where task_id=p_id and board_id=p_board;
 end if;
 return jsonb_build_object('ok',true);
end $$;

create function public.kaban_task_place(p_actor uuid,p_task uuid,p_source uuid,p_target uuid,p_revision integer,p_stage uuid,p_categories text[],p_move boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.kaban_tasks%rowtype; rights jsonb; allowed text[]; done_target boolean; previous_location jsonb;
begin
 perform set_config('kaban.actor',p_actor::text,true);
 -- Lock boards in a fixed order when moving between boards.
 perform 1 from public.kaban_boards where id in (p_source,p_target) order by id for update;
 perform public.kaban_check(p_actor,p_source,true);
 rights:=public.kaban_check(p_actor,p_target,true);
 select * into t from public.kaban_tasks where id=p_task for update;
 if not found then raise exception 'KABAN_NOT_FOUND'; end if;
 if t.creator_id<>p_actor then raise exception 'CREATOR_ONLY'; end if;
 perform public.kaban_task_access(p_actor,p_task,true,p_source);
 if t.revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if p_source=p_target then raise exception 'INVALID_CATEGORY'; end if;
 if jsonb_typeof(rights->'categoryIds')='array' then allowed:=array(select jsonb_array_elements_text(rights->'categoryIds')); end if;
 if cardinality(p_categories)=0 or exists(select 1 from unnest(p_categories) c where not exists(select 1 from public.kaban_categories where board_id=p_target and id=c and not archived) or not public.kaban_category_visible(p_target,c,allowed)) then raise exception 'INVALID_CATEGORY'; end if;
 if not exists(select 1 from public.kaban_boards b cross join lateral jsonb_array_elements(b.stages) s where b.id=p_target and s->>'id'=p_stage::text) then raise exception 'INVALID_STAGE'; end if;
 if (select count(*) from public.kaban_task_locations where board_id=p_target)>=5000 then raise exception 'TASK_LIMIT'; end if;
 select to_jsonb(x) into previous_location from public.kaban_task_locations x where task_id=p_task and board_id=p_source;
 insert into public.kaban_task_locations(task_id,board_id,stage_id,category_ids) values(p_task,p_target,p_stage,p_categories) on conflict(task_id,board_id) do update set stage_id=excluded.stage_id,category_ids=excluded.category_ids;
 if p_move and t.board_id=p_source then
  update public.kaban_tasks set board_id=p_target,stage_id=p_stage,category_ids=p_categories,archive_root=null,revision=revision+1,updated_at=now() where id=p_task;
 else update public.kaban_tasks set revision=revision+1,updated_at=now() where id=p_task;
 end if;
 if p_move then delete from public.kaban_task_locations where task_id=p_task and board_id=p_source; end if;
 insert into public.kaban_events(board_id,actor_id,entity,entity_id,task_id,action,category_ids,before_data,after_data)
 select board,p_actor,'location',p_task::text,p_task,case when p_move then 'MOVE' else 'LINK' end,cats,previous_location,jsonb_build_object('board_id',p_target)
 from (values(p_source,(previous_location->'category_ids')::jsonb),(p_target,to_jsonb(p_categories))) x(board,raw_cats)
 cross join lateral (select array(select jsonb_array_elements_text(raw_cats)) cats) c;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.kaban_files_access(p_actor uuid,p_task uuid,p_write boolean default false,p_file uuid default null,p_data jsonb default null,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare access jsonb;
begin
 perform set_config('kaban.actor',p_actor::text,true);
 access:=public.kaban_task_access(p_actor,p_task,p_write or p_file is not null);
 perform public.kaban_check(p_actor,(access->>'board_id')::uuid,p_write or p_file is not null);
 perform 1 from public.kaban_tasks where id=p_task for update;
 -- Recheck after taking the lock in case a concurrent move removed access.
 perform public.kaban_task_access(p_actor,p_task,p_write or p_file is not null,(access->>'board_id')::uuid);
 if p_file is not null then
  if p_delete then
   delete from public.kaban_files where id=p_file and task_id=p_task;
   if not found then raise exception 'KABAN_NOT_FOUND'; end if;
  else
   if (select count(*) from public.kaban_files where task_id=p_task)>=20 then raise exception 'FILE_LIMIT'; end if;
   insert into public.kaban_files(id,task_id,encrypted_data) values(p_file,p_task,p_data);
  end if;
 end if;
 return coalesce((select jsonb_agg(to_jsonb(f)) from public.kaban_files f where task_id=p_task),'[]'::jsonb);
end $$;

alter function public.kaban_category_mutate(uuid,uuid,text,integer,jsonb,boolean) rename to kaban_category_mutate_v30;
create function public.kaban_category_mutate(p_actor uuid,p_board uuid,p_id text,p_revision integer,p_data jsonb,p_archive boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; affected uuid[];
begin
 perform public.kaban_check(p_actor,p_board,true);
 if p_archive is not null then
  select array_agg(distinct t.id) into affected from public.kaban_tasks t join public.kaban_task_locations l on l.task_id=t.id where l.board_id=p_board and l.category_ids && (array[p_id]||array(select id from public.kaban_categories where board_id=p_board and parent_id=p_id)) and (not p_archive or not t.archived);
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
 if exists(select 1 from public.kaban_task_locations where board_id=p_board and stage_id::text not in (select value->>'id' from jsonb_array_elements(p_stages))) then raise exception 'STAGE_IN_USE'; end if;
 if exists(select 1 from public.kaban_task_locations l join public.kaban_tasks t on t.id=l.task_id join public.kaban_boards b on b.id=l.board_id cross join lateral jsonb_array_elements(p_stages) s cross join lateral jsonb_array_elements(b.stages) old where l.board_id=p_board and s->>'id'=l.stage_id::text and old->>'id'=l.stage_id::text and (s->>'done')::boolean and not (old->>'done')::boolean and t.creator_id<>p_actor and not p_actor=any(t.closer_ids)) then raise exception 'CREATOR_COMPLETION_ONLY'; end if;
 update public.kaban_boards set stages=p_stages,revision=revision+1 where id=p_board;
end $$;
create function public.kaban_mirror_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if pg_trigger_depth()>2 or new.entity not in ('task','file') then return null; end if;
 insert into public.kaban_events(board_id,actor_id,entity,entity_id,task_id,action,category_ids,before_data,after_data)
 select l.board_id,new.actor_id,new.entity,new.entity_id,new.task_id,new.action,l.category_ids,new.before_data,new.after_data from public.kaban_task_locations l where l.task_id=new.task_id and l.board_id<>new.board_id;
 return null;
end $$;
create trigger kaban_events_mirror after insert on public.kaban_events for each row execute function public.kaban_mirror_event();
create or replace function public.kaban_history(p_actor uuid,p_board uuid,p_before bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rights jsonb; allowed text[];
begin
 rights:=public.kaban_check(p_actor,p_board);
 if jsonb_typeof(rights->'categoryIds')='array' then allowed:=array(select jsonb_array_elements_text(rights->'categoryIds')); end if;
 return coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from (select * from public.kaban_events h where board_id=p_board and (p_before is null or id<p_before) and (category_ids is null or public.kaban_task_visible(p_board,coalesce((select category_ids from public.kaban_task_locations where task_id=h.task_id and board_id=p_board),category_ids),allowed)) order by id desc limit 51) e),'[]'::jsonb);
end $$;
revoke all on function public.kaban_sync_location(),public.kaban_location_allowed(uuid,uuid,text[],boolean),public.kaban_task_access(uuid,uuid,boolean,uuid),public.kaban_task_place(uuid,uuid,uuid,uuid,integer,uuid,text[],boolean),public.kaban_category_mutate(uuid,uuid,text,integer,jsonb,boolean),public.kaban_category_mutate_v30(uuid,uuid,text,integer,jsonb,boolean),public.kaban_mirror_event() from public,anon,authenticated;
-- The legacy category mutation is internal; API code only calls the guarded wrapper.
revoke all on function public.kaban_category_mutate_v30(uuid,uuid,text,integer,jsonb,boolean) from service_role;
grant execute on function public.kaban_location_allowed(uuid,uuid,text[],boolean),public.kaban_task_access(uuid,uuid,boolean,uuid),public.kaban_task_place(uuid,uuid,uuid,uuid,integer,uuid,text[],boolean),public.kaban_category_mutate(uuid,uuid,text,integer,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
