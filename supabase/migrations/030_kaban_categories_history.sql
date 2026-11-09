begin;
create table public.kaban_categories (
 board_id uuid not null references public.kaban_boards(id) on delete cascade,
 id text not null, name text not null, parent_id text, color text not null default '#6366f1',
 archived boolean not null default false, archive_root text, revision integer not null default 1,
 legacy_access text[], legacy_id text,
 primary key(board_id,id), foreign key(board_id,parent_id) references public.kaban_categories(board_id,id)
);
alter table public.kaban_tasks add column archived boolean not null default false;
alter table public.kaban_tasks add column archive_root text;
insert into public.kaban_categories(board_id,id,name,legacy_access,legacy_id)
 select distinct t.board_id,c.id,'Перенесённые задачи',array[c.id],c.id from public.kaban_tasks t cross join lateral unnest(t.category_ids) c(id);
alter table public.kaban_categories enable row level security;
revoke all on public.kaban_categories from public,anon,authenticated;
grant all on public.kaban_categories to service_role;
create function public.kaban_category_visible(p_board uuid,p_id text,p_categories text[])
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kaban_categories where board_id=p_board and id=p_id and (p_categories is null or legacy_access is null or legacy_access&&p_categories));
$$;
create function public.kaban_task_visible(p_board uuid,p_ids text[],p_categories text[])
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from unnest(p_ids) i where public.kaban_category_visible(p_board,i,p_categories));
$$;
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
 'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('file_count',(select count(*) from public.kaban_files where task_id=t.id)) order by t.created_at desc) from public.kaban_tasks t where t.board_id=b.id and public.kaban_task_visible(b.id,t.category_ids,categories)),'[]'::jsonb));
end $$;

create or replace function public.kaban_stages(p_actor uuid,p_board uuid,p_revision integer,p_stages jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform set_config('kaban.actor',p_actor::text,true);
 perform public.kaban_check(p_actor,p_board,true,true);
 if (select revision from public.kaban_boards where id=p_board)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if exists(select 1 from public.kaban_tasks where board_id=p_board and stage_id::text not in (select value->>'id' from jsonb_array_elements(p_stages))) then raise exception 'STAGE_IN_USE'; end if;
 update public.kaban_boards set stages=p_stages,revision=revision+1 where id=p_board;
end $$;

create or replace function public.kaban_task_mutate(p_actor uuid,p_board uuid,p_id uuid,p_revision integer,p_payload jsonb,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rights jsonb; b public.kaban_boards%rowtype; t public.kaban_tasks%rowtype; categories text[]; targets uuid[]; next_categories text[]; files jsonb;
begin
 perform set_config('kaban.actor',p_actor::text,true);
 rights:=public.kaban_check(p_actor,p_board,true);
 select * into b from public.kaban_boards where id=p_board;
 if jsonb_typeof(rights->'categoryIds')='array' then categories:=array(select jsonb_array_elements_text(rights->'categoryIds')); end if;
 select * into t from public.kaban_tasks where id=p_id and board_id=p_board for update;
 if p_revision>0 and t.id is null then raise exception 'KABAN_NOT_FOUND'; end if;
 if t.id is not null and not public.kaban_task_visible(p_board,t.category_ids,categories) then raise exception 'ACCESS_DENIED'; end if;
 if coalesce(t.revision,0)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if p_payload ? 'archive' then
  if t.id is null then raise exception 'KABAN_NOT_FOUND'; end if;
  if not (p_payload->>'archive')::boolean and exists(select 1 from public.kaban_categories where board_id=p_board and id=any(t.category_ids) and archived) then raise exception 'CATEGORY_ARCHIVED'; end if;
  update public.kaban_tasks set archived=(p_payload->>'archive')::boolean,archive_root=null,revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('ok',true);
 end if;
 if p_delete then
  if t.id is null then raise exception 'KABAN_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(id),'[]'::jsonb) into files from public.kaban_files where task_id=p_id;
  delete from public.kaban_tasks where id=p_id;
  return jsonb_build_object('deleted',true,'files',files);
 end if;
 if not exists(select 1 from jsonb_array_elements(b.stages) where value->>'id'=p_payload->>'stageId') then raise exception 'INVALID_STAGE'; end if;
 targets:=array(select value::uuid from jsonb_array_elements_text(p_payload->'participantIds'));
 next_categories:=array(select jsonb_array_elements_text(p_payload->'categoryIds'));
 if cardinality(next_categories)=0 or exists(select 1 from unnest(next_categories) c where not exists(select 1 from public.kaban_categories where board_id=p_board and id=c and not archived) or not public.kaban_category_visible(p_board,c,categories)) then raise exception 'INVALID_CATEGORY'; end if;
 if b.vault_id is null then
  if exists(select 1 from unnest(targets) u where u<>p_actor) then raise exception 'INVALID_PARTICIPANT'; end if;
 elsif exists(select 1 from unnest(targets) u where not exists(select 1 from public.shared_vault_members where vault_id=b.vault_id and user_id=u and (category_ids is null or public.kaban_task_visible(p_board,next_categories,category_ids)))) then raise exception 'INVALID_PARTICIPANT'; end if;
 if t.id is null then
  if (select count(*) from public.kaban_tasks where board_id=p_board)>=5000 then raise exception 'TASK_LIMIT'; end if;
  insert into public.kaban_tasks(id,board_id,creator_id,stage_id,participant_ids,category_ids,encrypted_data) values(p_id,p_board,p_actor,(p_payload->>'stageId')::uuid,targets,next_categories,p_payload->'encryptedData');
 else
  update public.kaban_tasks set stage_id=(p_payload->>'stageId')::uuid,participant_ids=targets,category_ids=next_categories,encrypted_data=p_payload->'encryptedData',revision=revision+1,updated_at=now() where id=p_id;
 end if;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.kaban_files_access(p_actor uuid,p_task uuid,p_write boolean default false,p_file uuid default null,p_data jsonb default null,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.kaban_tasks%rowtype; rights jsonb; categories text[];
begin
 perform set_config('kaban.actor',p_actor::text,true);
 select * into t from public.kaban_tasks where id=p_task;
 if not found then raise exception 'KABAN_NOT_FOUND'; end if;
 rights:=public.kaban_check(p_actor,t.board_id,p_write or p_file is not null);
 select * into t from public.kaban_tasks where id=p_task for update;
 if not found then raise exception 'KABAN_NOT_FOUND'; end if;
 if jsonb_typeof(rights->'categoryIds')='array' then categories:=array(select jsonb_array_elements_text(rights->'categoryIds')); end if;
 if not public.kaban_task_visible(t.board_id,t.category_ids,categories) then raise exception 'ACCESS_DENIED'; end if;
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
create function public.kaban_category_mutate(p_actor uuid,p_board uuid,p_id text,p_revision integer,p_data jsonb,p_archive boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rights jsonb; allowed text[]; c public.kaban_categories%rowtype; parent text; ids text[];
begin
 perform set_config('kaban.actor',p_actor::text,true);
 rights:=public.kaban_check(p_actor,p_board,true);
 if jsonb_typeof(rights->'categoryIds')='array' then allowed:=array(select jsonb_array_elements_text(rights->'categoryIds')); end if;
 select * into c from public.kaban_categories where board_id=p_board and id=p_id for update;
 if coalesce(c.revision,0)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if c.id is not null and not public.kaban_category_visible(p_board,p_id,allowed) then raise exception 'ACCESS_DENIED'; end if;
 if p_archive is not null then
  if c.id is null then raise exception 'KABAN_NOT_FOUND'; end if;
  if not p_archive and exists(select 1 from public.kaban_categories where board_id=p_board and id=c.parent_id and archived) then raise exception 'CATEGORY_ARCHIVED'; end if;
  ids:=array[p_id]||array(select id from public.kaban_categories where board_id=p_board and parent_id=p_id);
  if exists(select 1 from unnest(ids) i where not public.kaban_category_visible(p_board,i,allowed)) then raise exception 'ACCESS_DENIED'; end if;
  if p_archive then
   update public.kaban_categories set archived=true,archive_root=p_id,revision=revision+1 where board_id=p_board and id=any(ids) and not archived;
   update public.kaban_tasks set archived=true,archive_root=p_id,revision=revision+1,updated_at=now() where board_id=p_board and category_ids&&ids and not archived;
  else
   update public.kaban_categories set archived=false,archive_root=null,revision=revision+1 where board_id=p_board and id=any(ids) and archive_root=p_id;
   update public.kaban_tasks set archived=false,archive_root=null,revision=revision+1,updated_at=now() where board_id=p_board and archive_root=p_id;
  end if;
 else
  parent:=p_data->>'parentId';
  if parent is not null and (parent=p_id or not exists(select 1 from public.kaban_categories where board_id=p_board and id=parent and parent_id is null and not archived) or not public.kaban_category_visible(p_board,parent,allowed) or exists(select 1 from public.kaban_categories where board_id=p_board and parent_id=p_id)) then raise exception 'INVALID_CATEGORY'; end if;
  if c.id is null then
   insert into public.kaban_categories(board_id,id,name,parent_id,color) values(p_board,p_id,p_data->>'name',parent,p_data->>'color');
  else
   update public.kaban_categories set name=p_data->>'name',parent_id=parent,color=p_data->>'color',legacy_id=null,revision=revision+1 where board_id=p_board and id=p_id;
  end if;
 end if;
 return jsonb_build_object('ok',true);
end $$;

create table public.kaban_events (
 id bigint generated always as identity primary key,board_id uuid not null references public.kaban_boards(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,entity text not null,entity_id text not null,task_id uuid,
 action text not null,category_ids text[],before_data jsonb,after_data jsonb,created_at timestamptz not null default now()
);
create index kaban_events_board on public.kaban_events(board_id,id desc);
alter table public.kaban_events enable row level security;
revoke all on public.kaban_events from public,anon,authenticated;
grant select,insert on public.kaban_events to service_role;
grant usage,select on sequence public.kaban_events_id_seq to service_role;
create function public.kaban_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare b uuid; actor uuid; entity text; entity_id text; task uuid; cats text[]; before_row jsonb; after_row jsonb;
begin
 actor:=nullif(current_setting('kaban.actor',true),'')::uuid;
 if TG_OP<>'INSERT' then before_row:=to_jsonb(old); end if;
 if TG_OP<>'DELETE' then after_row:=to_jsonb(new); end if;
 if TG_TABLE_NAME='kaban_boards' then
  if TG_OP='UPDATE' and old.stages=new.stages then return null; end if;
  b:=coalesce(new.id,old.id);entity:='stages';entity_id:=b::text;
 elsif TG_TABLE_NAME='kaban_tasks' then
  b:=coalesce(new.board_id,old.board_id);entity:='task';entity_id:=coalesce(new.id,old.id)::text;task:=coalesce(new.id,old.id);cats:=coalesce(new.category_ids,old.category_ids);
 elsif TG_TABLE_NAME='kaban_categories' then
  b:=coalesce(new.board_id,old.board_id);entity:='category';entity_id:=coalesce(new.id,old.id);cats:=array[entity_id];
 else
  task:=coalesce(new.task_id,old.task_id);select board_id,category_ids into b,cats from public.kaban_tasks where id=task;entity:='file';entity_id:=coalesce(new.id,old.id)::text;
 end if;
 if b is null or not exists(select 1 from public.kaban_boards where id=b) then return null; end if;
 insert into public.kaban_events(board_id,actor_id,entity,entity_id,task_id,action,category_ids,before_data,after_data) values(b,actor,entity,entity_id,task,TG_OP,cats,before_row,after_row);
 return null;
end $$;
create trigger kaban_tasks_audit after insert or update or delete on public.kaban_tasks for each row execute function public.kaban_audit();
create trigger kaban_categories_audit after insert or update or delete on public.kaban_categories for each row execute function public.kaban_audit();
create trigger kaban_files_audit after insert or update or delete on public.kaban_files for each row execute function public.kaban_audit();
create trigger kaban_stages_audit after update on public.kaban_boards for each row execute function public.kaban_audit();
create function public.kaban_history(p_actor uuid,p_board uuid,p_before bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rights jsonb; allowed text[];
begin
 rights:=public.kaban_check(p_actor,p_board);
 if jsonb_typeof(rights->'categoryIds')='array' then allowed:=array(select jsonb_array_elements_text(rights->'categoryIds')); end if;
 return coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from (select * from public.kaban_events h where board_id=p_board and (p_before is null or id<p_before) and (category_ids is null or public.kaban_task_visible(p_board,coalesce((select category_ids from public.kaban_tasks where id=h.task_id),category_ids),allowed)) order by id desc limit 51) e),'[]'::jsonb);
end $$;
revoke all on function public.kaban_category_visible(uuid,text,text[]),public.kaban_task_visible(uuid,text[],text[]),public.kaban_category_mutate(uuid,uuid,text,integer,jsonb,boolean),public.kaban_history(uuid,uuid,bigint),public.kaban_audit() from public,anon,authenticated;
grant execute on function public.kaban_category_visible(uuid,text,text[]),public.kaban_task_visible(uuid,text[],text[]),public.kaban_category_mutate(uuid,uuid,text,integer,jsonb,boolean),public.kaban_history(uuid,uuid,bigint) to service_role;
notify pgrst,'reload schema';
commit;
