begin;
alter table public.app_notifications drop constraint app_notifications_kind_check;
alter table public.app_notifications add constraint app_notifications_kind_check check(kind in ('shared','subscription','kaban'));
alter table public.app_notifications add column kaban_key text;
create index kaban_events_notification_key on public.kaban_events(activity_key);
alter table public.kaban_events add column notification_meta jsonb;
create or replace function public.kaban_task_mutate(p_actor uuid,p_board uuid,p_id uuid,p_revision integer,p_payload jsonb,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare changes jsonb; l public.kaban_task_locations%rowtype; stages jsonb; old_done boolean; new_done boolean;
begin
 perform public.kaban_check(p_actor,p_board,true);
 perform 1 from public.kaban_tasks where id=p_id for update;
 select * into l from public.kaban_task_locations where task_id=p_id and board_id=p_board;
 select b.stages into stages from public.kaban_boards b where id=p_board;
 select (value->>'done')::boolean into old_done from jsonb_array_elements(stages) where value->>'id'=l.stage_id::text;
 select (value->>'done')::boolean into new_done from jsonb_array_elements(stages) where value->>'id'=p_payload->>'stageId';
 changes:=coalesce(p_payload->'activity','{}'::jsonb)||jsonb_build_object('taskId',p_id,'stageBoard',p_board,'stageBefore',(select value->>'name' from jsonb_array_elements(stages) where value->>'id'=l.stage_id::text),'stageAfter',(select value->>'name' from jsonb_array_elements(stages) where value->>'id'=p_payload->>'stageId'),'moved',l.task_id is not null and (l.stage_id::text is distinct from p_payload->>'stageId' or to_jsonb(l.category_ids) is distinct from p_payload->'categoryIds') and p_payload ? 'stageId','completed',coalesce(new_done,false) and not coalesce(old_done,false),'restored',coalesce(old_done,false) and not coalesce(new_done,false) and p_payload ? 'stageId');
 perform set_config('kaban.activity_meta',changes::text,true);
 return public.kaban_task_mutate_v34(p_actor,p_board,p_id,p_revision,p_payload,p_delete);
end $$;


create function public.kaban_notification_metadata() returns trigger language plpgsql security definer set search_path='' as $$
declare meta jsonb; stages jsonb;
begin
 if new.notification_meta is not null then return new; end if;
 meta:=coalesce(nullif(current_setting('kaban.activity_meta',true),'')::jsonb,'{}'::jsonb);
 if meta->>'taskId'=new.task_id::text and meta ? 'stageBefore' then
  new.notification_meta:=jsonb_build_object('stageBefore',meta->'stageBefore','stageAfter',meta->'stageAfter','stageBoard',meta->'stageBoard');
 elsif new.entity='task' then
  select b.stages into stages from public.kaban_boards b where id=new.board_id;
  new.notification_meta:=jsonb_build_object('stageBefore',(select value->>'name' from jsonb_array_elements(stages) where value->>'id'=new.before_data->>'stage_id'),'stageAfter',(select value->>'name' from jsonb_array_elements(stages) where value->>'id'=new.after_data->>'stage_id'));
 end if;
 return new;
end $$;
create trigger kaban_events_notification_metadata before insert on public.kaban_events for each row execute function public.kaban_notification_metadata();
create or replace function public.kaban_mirror_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if pg_trigger_depth()>2 or new.entity not in ('task','file') then return null; end if;
 insert into public.kaban_events(board_id,actor_id,entity,entity_id,task_id,action,category_ids,before_data,after_data,activity,activity_key,notification_meta)
 select l.board_id,new.actor_id,new.entity,new.entity_id,new.task_id,new.action,l.category_ids,new.before_data,new.after_data,new.activity,new.activity_key,new.notification_meta from public.kaban_task_locations l where l.task_id=new.task_id and l.board_id<>new.board_id;
 return null;
end $$;
create function public.kaban_notification_deliver(p_event public.kaban_events) returns void language sql security definer set search_path='' as $$
 insert into public.app_notifications(user_id,kind,dedupe_key,kaban_key,title,message,created_at)
 select m.user_id,'kaban','kaban/'||p_event.activity_key,p_event.activity_key,'Изменение задачи','',p_event.created_at
 from public.kaban_boards b join public.shared_vault_members m on m.vault_id=b.vault_id
 left join public.notification_preferences p on p.user_id=m.user_id
 where b.id=p_event.board_id and p_event.entity in ('task','file','location') and p_event.actor_id<>m.user_id
 and (p_event.activity is null or p_event.activity->'kinds'<>'[]'::jsonb)
 and coalesce((p.settings->>'sharedChanges')::boolean,true) and public.kaban_activity_visible(m.user_id,p_event)
 on conflict(user_id,dedupe_key) do nothing;
$$;
create function public.kaban_notification_insert() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.kaban_notification_deliver(new);return null;end $$;
create trigger kaban_events_notify after insert on public.kaban_events for each row execute function public.kaban_notification_insert();
-- Seed existing retained history once; dismissal markers prevent resurrection.
do $$ declare h public.kaban_events%rowtype; begin
 for h in select * from public.kaban_events where entity in ('task','file','location') and created_at>=now()-interval '30 days' order by id desc limit 5000 loop
  perform public.kaban_notification_deliver(h);
 end loop;
end $$;
create function public.kaban_notification_events(p_actor uuid,p_keys text[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select distinct on(e.activity_key) e.*,b.vault_id,v.name vault_name,b.stages,
 coalesce(to_jsonb(t),(select coalesce(h.after_data,h.before_data) from public.kaban_events h where h.task_id=e.task_id and h.board_id=e.board_id and h.entity='task' order by h.id desc limit 1)) task_snapshot,
 exists(select 1 from public.kaban_task_locations l where l.task_id=e.task_id and l.board_id=e.board_id and public.kaban_location_allowed(p_actor,l.board_id,l.category_ids)) task_available
 from public.kaban_events e join public.kaban_boards b on b.id=e.board_id left join public.shared_vaults v on v.id=b.vault_id left join public.kaban_tasks t on t.id=e.task_id
 where e.activity_key=any(p_keys) and e.actor_id<>p_actor and public.kaban_activity_visible(p_actor,e)
 order by e.activity_key,e.id desc
 ) x;
$$;
revoke all on function public.kaban_notification_metadata(),public.kaban_notification_deliver(public.kaban_events),public.kaban_notification_insert(),public.kaban_notification_events(uuid,text[]) from public,anon,authenticated;
grant execute on function public.kaban_notification_events(uuid,text[]) to service_role;
notify pgrst,'reload schema';
commit;
