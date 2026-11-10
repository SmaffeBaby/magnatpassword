begin;
alter table public.kaban_events add column activity jsonb,add column activity_key text;
create index kaban_events_actor_activity on public.kaban_events(actor_id,created_at);
-- Historical mirrors share the same snapshots, actor and timestamp.
update public.kaban_events set activity_key=md5(jsonb_build_array(created_at,actor_id,entity,entity_id,action,before_data,after_data)::text) where entity in ('task','file','location');

create function public.kaban_activity_classify(p_event jsonb,p_changes jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb:=p_event->'before_data'; b jsonb:=p_event->'after_data'; entity text:=p_event->>'entity'; action text:=p_event->>'action'; kinds text[]:='{}'; checked integer:=0; stages jsonb; old_done boolean; new_done boolean; changed boolean;
begin
 if entity='file' then kinds:=array['files'];
 elsif entity='location' then kinds:=array['moved'];
 elsif entity='task' then
  if action='INSERT' then kinds:=array['created'];
  elsif action='DELETE' then kinds:=array['deleted'];
  else
   select x.stages into stages from public.kaban_boards x where x.id=coalesce(b->>'board_id',a->>'board_id',p_event->>'board_id')::uuid;
   select (value->>'done')::boolean into old_done from jsonb_array_elements(stages) where value->>'id'=a->>'stage_id';
   select (value->>'done')::boolean into new_done from jsonb_array_elements(stages) where value->>'id'=b->>'stage_id';
   if (coalesce((b->>'archived')::boolean,false) and not coalesce((a->>'archived')::boolean,false)) or coalesce((p_changes->>'completed')::boolean,false) or (a->>'board_id'=b->>'board_id' and coalesce(new_done,false) and not coalesce(old_done,false)) then kinds:=kinds||'completed'::text; end if;
   if (coalesce((a->>'archived')::boolean,false) and not coalesce((b->>'archived')::boolean,false)) or coalesce((p_changes->>'restored')::boolean,false) or (a->>'board_id'=b->>'board_id' and coalesce(old_done,false) and not coalesce(new_done,false)) then kinds:=kinds||'restored'::text; end if;
   if coalesce((p_changes->>'moved')::boolean,false) or (a->>'board_id'=b->>'board_id' and (a->'stage_id' is distinct from b->'stage_id' or a->'category_ids' is distinct from b->'category_ids')) then kinds:=kinds||'moved'::text; end if;
   changed:=coalesce((p_changes->>'content')::boolean,false) or a->'participant_ids' is distinct from b->'participant_ids' or a->'closer_ids' is distinct from b->'closer_ids' or coalesce((p_changes->>'deadline')::boolean,false);
   if changed then kinds:=kinds||'updated'::text; end if;
   if coalesce((p_changes->>'checklist')::boolean,false) then kinds:=kinds||'checklist'::text; end if;
   checked:=coalesce((p_changes->>'checked')::integer,0);
  end if;
 end if;
 return jsonb_build_object('kinds',to_jsonb(kinds),'checked',checked);
end $$;

create function public.kaban_activity_event() returns trigger language plpgsql security definer set search_path='' as $$
declare changes jsonb;
begin
 if new.entity not in ('task','file','location') then return new; end if;
 if new.activity_key is null then new.activity_key:=pg_current_xact_id()::text||':'||new.entity||':'||new.entity_id||':'||new.action; end if;
 if new.activity is not null then return new; end if;
 changes:=coalesce(nullif(current_setting('kaban.activity_meta',true),'')::jsonb,'{}'::jsonb);
 if changes->>'taskId' is distinct from new.task_id::text then changes:='{}'; end if;
 new.activity:=public.kaban_activity_classify(to_jsonb(new),changes);
 return new;
end $$;
create trigger kaban_events_activity before insert on public.kaban_events for each row execute function public.kaban_activity_event();
create or replace function public.kaban_mirror_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if pg_trigger_depth()>2 or new.entity not in ('task','file') then return null; end if;
 insert into public.kaban_events(board_id,actor_id,entity,entity_id,task_id,action,category_ids,before_data,after_data,activity,activity_key)
 select l.board_id,new.actor_id,new.entity,new.entity_id,new.task_id,new.action,l.category_ids,new.before_data,new.after_data,new.activity,new.activity_key from public.kaban_task_locations l where l.task_id=new.task_id and l.board_id<>new.board_id;
 return null;
end $$;

alter function public.kaban_task_mutate(uuid,uuid,uuid,integer,jsonb,boolean) rename to kaban_task_mutate_v34;
create function public.kaban_task_mutate(p_actor uuid,p_board uuid,p_id uuid,p_revision integer,p_payload jsonb,p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare changes jsonb; l public.kaban_task_locations%rowtype; stages jsonb; old_done boolean; new_done boolean;
begin
 perform public.kaban_check(p_actor,p_board,true);
 perform 1 from public.kaban_tasks where id=p_id for update;
 select * into l from public.kaban_task_locations where task_id=p_id and board_id=p_board;
 select b.stages into stages from public.kaban_boards b where id=p_board;
 select (value->>'done')::boolean into old_done from jsonb_array_elements(stages) where value->>'id'=l.stage_id::text;
 select (value->>'done')::boolean into new_done from jsonb_array_elements(stages) where value->>'id'=p_payload->>'stageId';
 changes:=coalesce(p_payload->'activity','{}'::jsonb)||jsonb_build_object('taskId',p_id,'moved',l.task_id is not null and (l.stage_id::text is distinct from p_payload->>'stageId' or to_jsonb(l.category_ids) is distinct from p_payload->'categoryIds') and p_payload ? 'stageId','completed',coalesce(new_done,false) and not coalesce(old_done,false),'restored',coalesce(old_done,false) and not coalesce(new_done,false) and p_payload ? 'stageId');
 perform set_config('kaban.activity_meta',changes::text,true);
 return public.kaban_task_mutate_v34(p_actor,p_board,p_id,p_revision,p_payload,p_delete);
end $$;

create function public.kaban_activity_visible(p_actor uuid,p_event public.kaban_events)
returns boolean language sql stable security definer set search_path='' as $$
 select public.kaban_location_allowed(p_actor,p_event.board_id,coalesce((select category_ids from public.kaban_task_locations where task_id=p_event.task_id and board_id=p_event.board_id),p_event.category_ids,'{}'::text[]));
$$;
create function public.kaban_activity_backlog(p_actor uuid,p_target uuid,p_year integer)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from (select h.* from public.kaban_events h where h.actor_id=p_target and h.activity is null and h.entity in ('task','file','location') and h.created_at>=make_date(p_year,1,1)::timestamp at time zone 'Europe/Moscow' and h.created_at<make_date(p_year+1,1,1)::timestamp at time zone 'Europe/Moscow' and h.created_at<=now() and public.kaban_activity_visible(p_actor,h) order by h.id limit 500) e;
$$;
create function public.kaban_activity_cache(p_actor uuid,p_rows jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; h public.kaban_events%rowtype;
begin
 for item in select value from jsonb_array_elements(p_rows) loop
  select * into h from public.kaban_events where id=(item->>'id')::bigint and activity is null;
  if h.id is not null and public.kaban_activity_visible(p_actor,h) then
   update public.kaban_events set activity=public.kaban_activity_classify(to_jsonb(h),item->'changes') where id=h.id and activity is null;
  end if;
 end loop;
end $$;

create function public.kaban_activity(p_actor uuid,p_target uuid,p_year integer,p_vault text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare years jsonb; vaults jsonb; days jsonb;
begin
 if p_year<1970 or p_year>extract(year from now() at time zone 'Europe/Moscow')::integer then raise exception 'INVALID_YEAR'; end if;
 select coalesce(jsonb_agg(y order by y desc),'[]'::jsonb) into years from (select distinct extract(year from created_at at time zone 'Europe/Moscow')::integer y from public.kaban_events h where actor_id=p_target and entity in ('task','file','location') and created_at<=now() and public.kaban_activity_visible(p_actor,h)) x;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) into vaults from (select distinct coalesce(b.vault_id::text,'personal') id,coalesce(v.name,'Личное хранилище') name from public.kaban_events h join public.kaban_boards b on b.id=h.board_id left join public.shared_vaults v on v.id=b.vault_id where h.actor_id=p_target and h.entity in ('task','file','location') and h.created_at<=now() and public.kaban_activity_visible(p_actor,h)) x;
 with visible as (
  select distinct on(h.activity_key) h.activity_key,h.activity,to_char(h.created_at at time zone 'Europe/Moscow','YYYY-MM-DD') event_day from public.kaban_events h join public.kaban_boards b on b.id=h.board_id
  where h.actor_id=p_target and h.activity is not null and h.activity->'kinds'<>'[]'::jsonb and h.created_at>=make_date(p_year,1,1)::timestamp at time zone 'Europe/Moscow' and h.created_at<make_date(p_year+1,1,1)::timestamp at time zone 'Europe/Moscow' and h.created_at<=now()
   and (p_vault='all' or (p_vault='personal' and b.vault_id is null) or b.vault_id::text=p_vault) and public.kaban_activity_visible(p_actor,h)
  order by h.activity_key,h.id
 ), daily as (
  select event_day,count(*) total,sum(coalesce((activity->>'checked')::integer,0)) checked,
   jsonb_build_object('created',count(*) filter(where activity->'kinds' ? 'created'),'completed',count(*) filter(where activity->'kinds' ? 'completed'),'updated',count(*) filter(where activity->'kinds' ? 'updated'),'moved',count(*) filter(where activity->'kinds' ? 'moved'),'checklist',count(*) filter(where activity->'kinds' ? 'checklist'),'files',count(*) filter(where activity->'kinds' ? 'files'),'restored',count(*) filter(where activity->'kinds' ? 'restored'),'deleted',count(*) filter(where activity->'kinds' ? 'deleted')) kinds
  from visible group by event_day
 ) select coalesce(jsonb_agg(jsonb_build_object('date',event_day,'total',total,'checked',checked,'kinds',kinds) order by event_day),'[]'::jsonb) into days from daily;
 return jsonb_build_object('year',p_year,'today',to_char(now() at time zone 'Europe/Moscow','YYYY-MM-DD'),'years',years,'vaults',vaults,'days',days);
end $$;
revoke all on function public.kaban_activity_classify(jsonb,jsonb),public.kaban_activity_event(),public.kaban_task_mutate(uuid,uuid,uuid,integer,jsonb,boolean),public.kaban_task_mutate_v34(uuid,uuid,uuid,integer,jsonb,boolean),public.kaban_activity_visible(uuid,public.kaban_events),public.kaban_activity_backlog(uuid,uuid,integer),public.kaban_activity_cache(uuid,jsonb),public.kaban_activity(uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.kaban_task_mutate_v34(uuid,uuid,uuid,integer,jsonb,boolean) from service_role;
grant execute on function public.kaban_task_mutate(uuid,uuid,uuid,integer,jsonb,boolean),public.kaban_activity_backlog(uuid,uuid,integer),public.kaban_activity_cache(uuid,jsonb),public.kaban_activity(uuid,uuid,integer,text) to service_role;
notify pgrst,'reload schema';
commit;
