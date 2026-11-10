begin;
alter table public.kaban_tasks add column closed_at timestamptz;
update public.kaban_tasks t set closed_at=(select max(e.created_at) from public.kaban_events e where e.task_id=t.id and e.entity='task' and e.action='UPDATE' and e.after_data->>'archived'='true' and coalesce(e.before_data->>'archived','false')='false') where t.archived;
create function public.kaban_task_closed_at() returns trigger language plpgsql set search_path='' as $$
begin
 if new.archived and (tg_op='INSERT' or not old.archived) then new.closed_at:=now();
 elsif not new.archived then new.closed_at:=null;
 else new.closed_at:=old.closed_at;end if;
 return new;
end $$;
create trigger kaban_task_closed_at before insert or update on public.kaban_tasks for each row execute function public.kaban_task_closed_at();

-- Realtime carries only a per-user invalidation token, never task contents.
create table public.kaban_live (user_id uuid primary key references auth.users(id) on delete cascade,token uuid not null default gen_random_uuid());
alter table public.kaban_live enable row level security;
revoke all on public.kaban_live from public,anon,authenticated;
grant select on public.kaban_live to authenticated;
grant all on public.kaban_live to service_role;
create policy kaban_live_self on public.kaban_live for select to authenticated using(user_id=(select auth.uid()));
create function public.kaban_signal(p_board uuid,p_extra uuid default null) returns void language sql security definer set search_path='' as $$
 insert into public.kaban_live(user_id)
 select distinct u from (select b.owner_id u from public.kaban_boards b where b.id=p_board and b.vault_id is null union select m.user_id from public.kaban_boards b join public.shared_vault_members m on m.vault_id=b.vault_id where b.id=p_board union select p_extra where p_extra is not null) x where exists(select 1 from auth.users where id=u)
 on conflict(user_id) do update set token=gen_random_uuid();
$$;
create function public.kaban_live_event() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.kaban_signal(new.board_id);return null;end $$;
create trigger kaban_events_live after insert on public.kaban_events for each row execute function public.kaban_live_event();
create function public.kaban_live_membership() returns trigger language plpgsql security definer set search_path='' as $$
declare v uuid; u uuid; b uuid;
begin
 if tg_op='DELETE' then v:=old.vault_id;u:=old.user_id;else v:=new.vault_id;u:=new.user_id;end if;
 select id into b from public.kaban_boards where vault_id=v;
 if b is not null then perform public.kaban_signal(b,u);end if;
 return null;
end $$;
create trigger kaban_membership_live after insert or update or delete on public.shared_vault_members for each row execute function public.kaban_live_membership();
do $$ begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime;end if;
end $$;
alter publication supabase_realtime add table public.kaban_live;

create function public.kaban_copy_task(p_actor uuid,p_source uuid,p_task uuid,p_revision integer,p_new uuid,p_payload jsonb,p_files jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare t public.kaban_tasks%rowtype; f jsonb;
begin
 perform public.kaban_check(p_actor,p_source,true);
 select * into t from public.kaban_tasks where id=p_task for update;
 if not found then raise exception 'KABAN_NOT_FOUND';end if;
 perform public.kaban_task_access(p_actor,p_task,true,p_source);
 if t.revision<>p_revision then raise exception 'REVISION_CONFLICT';end if;
 if (select count(*) from public.kaban_files where task_id=p_task)<>jsonb_array_length(p_files) or exists(select 1 from jsonb_array_elements(p_files) x where not exists(select 1 from public.kaban_files f where f.task_id=p_task and f.id::text=x->>'sourceId' and f.encrypted_data=x->'sourceEncrypted')) then raise exception 'REVISION_CONFLICT';end if;
 perform public.kaban_task_mutate(p_actor,p_source,p_new,0,p_payload);
 for f in select value from jsonb_array_elements(p_files) loop
  insert into public.kaban_files(id,task_id,encrypted_data) values((f->>'id')::uuid,p_new,f->'encryptedData');
 end loop;
end $$;
revoke all on function public.kaban_task_closed_at(),public.kaban_signal(uuid,uuid),public.kaban_live_event(),public.kaban_live_membership(),public.kaban_copy_task(uuid,uuid,uuid,integer,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kaban_copy_task(uuid,uuid,uuid,integer,uuid,jsonb,jsonb) to service_role;
create or replace function public.kaban_activity(p_actor uuid,p_target uuid,p_year integer,p_vault text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare years jsonb; vaults jsonb; days jsonb;
begin
 if p_year<1970 or p_year>extract(year from now() at time zone 'Europe/Moscow')::integer then raise exception 'INVALID_YEAR'; end if;
 select coalesce(jsonb_agg(y order by y desc),'[]'::jsonb) into years from (select distinct extract(year from created_at at time zone 'Europe/Moscow')::integer y from public.kaban_events h where actor_id=p_target and entity in ('task','file','location') and created_at<=now() and public.kaban_activity_visible(p_actor,h)) x;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb) into vaults from (select distinct coalesce(b.vault_id::text,'personal') id,coalesce(v.name,'Личное хранилище') name from public.kaban_events h join public.kaban_boards b on b.id=h.board_id left join public.shared_vaults v on v.id=b.vault_id where h.actor_id=p_target and h.entity in ('task','file','location') and h.created_at<=now() and public.kaban_activity_visible(p_actor,h)) x;
 with visible as (
  select distinct on(h.activity_key) h.activity_key,h.activity,to_char(h.created_at at time zone 'Europe/Moscow','YYYY-MM-DD') event_day from public.kaban_events h join public.kaban_boards b on b.id=h.board_id
  where h.actor_id=p_target and h.activity is not null and h.activity->'kinds' ?| array['created','completed','moved'] and h.created_at>=make_date(p_year,1,1)::timestamp at time zone 'Europe/Moscow' and h.created_at<make_date(p_year+1,1,1)::timestamp at time zone 'Europe/Moscow' and h.created_at<=now()
   and (p_vault='all' or (p_vault='personal' and b.vault_id is null) or b.vault_id::text=p_vault) and public.kaban_activity_visible(p_actor,h)
  order by h.activity_key,h.id
 ), daily as (
  select event_day,count(*) total,sum(coalesce((activity->>'checked')::integer,0)) checked,
   jsonb_build_object('created',count(*) filter(where activity->'kinds' ? 'created'),'completed',count(*) filter(where activity->'kinds' ? 'completed'),'updated',count(*) filter(where activity->'kinds' ? 'updated'),'moved',count(*) filter(where activity->'kinds' ? 'moved'),'checklist',count(*) filter(where activity->'kinds' ? 'checklist'),'files',count(*) filter(where activity->'kinds' ? 'files'),'restored',count(*) filter(where activity->'kinds' ? 'restored'),'deleted',count(*) filter(where activity->'kinds' ? 'deleted')) kinds
  from visible group by event_day
 ) select coalesce(jsonb_agg(jsonb_build_object('date',event_day,'total',total,'checked',checked,'kinds',kinds) order by event_day),'[]'::jsonb) into days from daily;
 return jsonb_build_object('year',p_year,'today',to_char(now() at time zone 'Europe/Moscow','YYYY-MM-DD'),'years',years,'vaults',vaults,'days',days);
end $$;

notify pgrst,'reload schema';
commit;
