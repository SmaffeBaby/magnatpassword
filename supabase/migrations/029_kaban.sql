begin;
create table public.kaban_boards (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 vault_id uuid references public.shared_vaults(id) on delete cascade, revision integer not null default 1,
 stages jsonb not null default jsonb_build_array(
  jsonb_build_object('id',gen_random_uuid(),'name','Входящие','color','#64748b','done',false),
  jsonb_build_object('id',gen_random_uuid(),'name','В работе','color','#6366f1','done',false),
  jsonb_build_object('id',gen_random_uuid(),'name','На проверке','color','#f59e0b','done',false),
  jsonb_build_object('id',gen_random_uuid(),'name','Готово','color','#10b981','done',true))
);
create unique index kaban_vault_board on public.kaban_boards(vault_id) where vault_id is not null;
create unique index kaban_personal_board on public.kaban_boards(owner_id) where vault_id is null;
create table public.kaban_tasks (
 id uuid primary key, board_id uuid not null references public.kaban_boards(id) on delete cascade,
 creator_id uuid not null references auth.users(id), stage_id uuid not null,
 participant_ids uuid[] not null default '{}', category_ids text[] not null default '{}',
 encrypted_data jsonb not null, revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index kaban_tasks_board on public.kaban_tasks(board_id,created_at);
create table public.kaban_files (
 id uuid primary key, task_id uuid not null references public.kaban_tasks(id) on delete cascade, encrypted_data jsonb not null
);
create index kaban_files_task on public.kaban_files(task_id);
alter table public.kaban_boards enable row level security;
alter table public.kaban_tasks enable row level security;
alter table public.kaban_files enable row level security;
revoke all on public.kaban_boards,public.kaban_tasks,public.kaban_files from public,anon,authenticated;
grant all on public.kaban_boards,public.kaban_tasks,public.kaban_files to service_role;

-- Keep authorization inside the mutation transaction, including category restrictions.
create function public.kaban_check(p_actor uuid,p_board uuid,p_write boolean default false,p_manage boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.kaban_boards%rowtype; m public.shared_vault_members%rowtype; manager boolean;
begin
 select * into b from public.kaban_boards where id=p_board for update;
 if not found then raise exception 'KABAN_NOT_FOUND'; end if;
 if b.vault_id is null then
  if b.owner_id<>p_actor then raise exception 'ACCESS_DENIED'; end if;
  return jsonb_build_object('canEdit',true,'canManage',true,'categoryIds',null);
 end if;
 select * into m from public.shared_vault_members where vault_id=b.vault_id and user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 manager:=m.category_ids is null and (m.member_role='manager' or exists(select 1 from public.shared_vaults where id=b.vault_id and owner_id=p_actor));
 if (p_write and m.member_role='viewer') or (p_manage and not manager) then raise exception 'ACCESS_DENIED'; end if;
 return jsonb_build_object('canEdit',m.member_role<>'viewer','canManage',manager,'categoryIds',m.category_ids);
end $$;

create function public.kaban_load(p_actor uuid,p_vault uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.kaban_boards%rowtype; rights jsonb; categories text[];
begin
 if p_vault is not null and not exists(select 1 from public.shared_vault_members where vault_id=p_vault and user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 insert into public.kaban_boards(owner_id,vault_id) values(p_actor,p_vault) on conflict do nothing;
 select * into b from public.kaban_boards where (p_vault is null and vault_id is null and owner_id=p_actor) or (p_vault is not null and vault_id=p_vault);
 rights:=public.kaban_check(p_actor,b.id);
 if jsonb_typeof(rights->'categoryIds')='array' then categories:=array(select jsonb_array_elements_text(rights->'categoryIds')); end if;
 return rights||jsonb_build_object('board',jsonb_build_object('id',b.id,'vaultId',b.vault_id,'revision',b.revision,'stages',b.stages),
 'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('file_count',(select count(*) from public.kaban_files where task_id=t.id)) order by t.created_at desc) from public.kaban_tasks t where t.board_id=b.id and (categories is null or t.category_ids&&categories)),'[]'::jsonb));
end $$;

create function public.kaban_stages(p_actor uuid,p_board uuid,p_revision integer,p_stages jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.kaban_check(p_actor,p_board,true,true);
 if (select revision from public.kaban_boards where id=p_board)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if exists(select 1 from public.kaban_tasks where board_id=p_board and stage_id::text not in (select value->>'id' from jsonb_array_elements(p_stages))) then raise exception 'STAGE_IN_USE'; end if;
 update public.kaban_boards set stages=p_stages,revision=revision+1 where id=p_board;
end $$;

create function public.kaban_task_mutate(p_actor uuid,p_board uuid,p_id uuid,p_revision integer,p_payload jsonb,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rights jsonb; b public.kaban_boards%rowtype; t public.kaban_tasks%rowtype; categories text[]; targets uuid[]; next_categories text[]; files jsonb;
begin
 rights:=public.kaban_check(p_actor,p_board,true);
 select * into b from public.kaban_boards where id=p_board;
 if jsonb_typeof(rights->'categoryIds')='array' then categories:=array(select jsonb_array_elements_text(rights->'categoryIds')); end if;
 select * into t from public.kaban_tasks where id=p_id and board_id=p_board for update;
 if p_revision>0 and t.id is null then raise exception 'KABAN_NOT_FOUND'; end if;
 if t.id is not null and (categories is not null and not (t.category_ids&&categories)) then raise exception 'ACCESS_DENIED'; end if;
 if coalesce(t.revision,0)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if p_delete then
  if t.id is null then raise exception 'KABAN_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(id),'[]'::jsonb) into files from public.kaban_files where task_id=p_id;
  delete from public.kaban_tasks where id=p_id;
  return jsonb_build_object('deleted',true,'files',files);
 end if;
 if not exists(select 1 from jsonb_array_elements(b.stages) where value->>'id'=p_payload->>'stageId') then raise exception 'INVALID_STAGE'; end if;
 targets:=array(select value::uuid from jsonb_array_elements_text(p_payload->'participantIds'));
 next_categories:=array(select jsonb_array_elements_text(p_payload->'categoryIds'));
 if categories is not null and (not(next_categories&&categories) or not(next_categories<@categories)) then raise exception 'ACCESS_DENIED'; end if;
 if b.vault_id is null then
  if exists(select 1 from unnest(targets) u where u<>p_actor) then raise exception 'INVALID_PARTICIPANT'; end if;
 elsif exists(select 1 from unnest(targets) u where not exists(select 1 from public.shared_vault_members where vault_id=b.vault_id and user_id=u and (category_ids is null or category_ids&&next_categories))) then raise exception 'INVALID_PARTICIPANT'; end if;
 if t.id is null then
  if (select count(*) from public.kaban_tasks where board_id=p_board)>=5000 then raise exception 'TASK_LIMIT'; end if;
  insert into public.kaban_tasks(id,board_id,creator_id,stage_id,participant_ids,category_ids,encrypted_data) values(p_id,p_board,p_actor,(p_payload->>'stageId')::uuid,targets,next_categories,p_payload->'encryptedData');
 else
  update public.kaban_tasks set stage_id=(p_payload->>'stageId')::uuid,participant_ids=targets,category_ids=next_categories,encrypted_data=p_payload->'encryptedData',revision=revision+1,updated_at=now() where id=p_id;
 end if;
 return jsonb_build_object('ok',true);
end $$;

create function public.kaban_files_access(p_actor uuid,p_task uuid,p_write boolean default false,p_file uuid default null,p_data jsonb default null,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.kaban_tasks%rowtype; rights jsonb; categories text[];
begin
 select * into t from public.kaban_tasks where id=p_task;
 if not found then raise exception 'KABAN_NOT_FOUND'; end if;
 rights:=public.kaban_check(p_actor,t.board_id,p_write or p_file is not null);
 select * into t from public.kaban_tasks where id=p_task for update;
 if not found then raise exception 'KABAN_NOT_FOUND'; end if;
 if jsonb_typeof(rights->'categoryIds')='array' then categories:=array(select jsonb_array_elements_text(rights->'categoryIds')); end if;
 if categories is not null and not(t.category_ids&&categories) then raise exception 'ACCESS_DENIED'; end if;
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

revoke all on function public.kaban_check(uuid,uuid,boolean,boolean),public.kaban_load(uuid,uuid),public.kaban_stages(uuid,uuid,integer,jsonb),public.kaban_task_mutate(uuid,uuid,uuid,integer,jsonb,boolean),public.kaban_files_access(uuid,uuid,boolean,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.kaban_check(uuid,uuid,boolean,boolean),public.kaban_load(uuid,uuid),public.kaban_stages(uuid,uuid,integer,jsonb),public.kaban_task_mutate(uuid,uuid,uuid,integer,jsonb,boolean),public.kaban_files_access(uuid,uuid,boolean,uuid,jsonb,boolean) to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('kaban-files','kaban-files',false,20971520);

-- Add the new application without resetting existing custom rows or hidden cards.
update public.account_home_layouts set layout=case when jsonb_array_length(layout->'rows')>0 then
 jsonb_set(layout,array['rows','0','cards'],(layout->'rows'->0->'cards')||'"kaban"'::jsonb)
 else jsonb_set(layout,'{hidden}',(layout->'hidden')||'"kaban"'::jsonb) end,
 revision=revision+1,updated_at=now();
notify pgrst,'reload schema';
commit;
