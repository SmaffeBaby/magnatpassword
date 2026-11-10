begin;
alter table public.kaban_boards
 add column history_retention_count integer,
 add column history_retention_unit text not null default 'days' check(history_retention_unit in ('days','months','years')),
 add column history_settings_revision integer not null default 0,
 add constraint kaban_history_retention_count_check check(history_retention_count is null or history_retention_count between 1 and 1000);
create index kaban_events_retention on public.kaban_events(board_id,created_at);

create function public.kaban_history_cutoff(p_count integer,p_unit text,p_at timestamptz default now())
returns timestamptz language sql stable set search_path='' as $$
 select ((p_at at time zone 'Europe/Moscow') - case p_unit when 'days' then make_interval(days=>p_count) when 'months' then make_interval(months=>p_count) when 'years' then make_interval(years=>p_count) end) at time zone 'Europe/Moscow';
$$;
create function public.kaban_history_settings(p_actor uuid,p_board uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.kaban_boards%rowtype; rights jsonb;
begin
 rights:=public.kaban_check(p_actor,p_board,true,true);
 select * into b from public.kaban_boards where id=p_board;
 return jsonb_build_object('revision',b.history_settings_revision,'count',b.history_retention_count,'unit',b.history_retention_unit,
 'eventCount',(select count(*) from public.kaban_events where board_id=p_board),
 'throughId',(select max(id)::text from public.kaban_events where board_id=p_board));
end $$;
create function public.kaban_history_retention_set(p_actor uuid,p_board uuid,p_revision integer,p_count integer,p_unit text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.kaban_check(p_actor,p_board,true,true);
 if p_unit not in ('days','months','years') or p_unit is null or (p_count is not null and (p_count<1 or p_count>1000)) then raise exception 'INVALID_RETENTION'; end if;
 if (select history_settings_revision from public.kaban_boards where id=p_board)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 update public.kaban_boards set history_retention_count=p_count,history_retention_unit=p_unit,history_settings_revision=history_settings_revision+1 where id=p_board;
 return public.kaban_history_settings(p_actor,p_board);
end $$;
create function public.kaban_history_clear(p_actor uuid,p_board uuid,p_revision integer,p_through bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
 perform public.kaban_check(p_actor,p_board,true,true);
 if (select history_settings_revision from public.kaban_boards where id=p_board)<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if p_through is null or p_through<1 then raise exception 'INVALID_RETENTION'; end if;
 delete from public.kaban_events where board_id=p_board and id<=p_through;
 get diagnostics removed=row_count;
 -- Concurrent changes created after the confirmation snapshot are kept.
 update public.kaban_boards set history_settings_revision=history_settings_revision+1 where id=p_board;
 return removed;
end $$;
create function public.kaban_prune_history(p_board uuid default null)
returns bigint language plpgsql security definer set search_path='' as $$
declare b record; removed bigint; total bigint:=0;
begin
 for b in select id,history_retention_count,history_retention_unit from public.kaban_boards where history_retention_count is not null and (p_board is null or id=p_board) order by id for update skip locked loop
  delete from public.kaban_events where board_id=b.id and created_at<public.kaban_history_cutoff(b.history_retention_count,b.history_retention_unit);
  get diagnostics removed=row_count;
  total:=total+removed;
 end loop;
 return total;
end $$;
revoke all on function public.kaban_history_cutoff(integer,text,timestamptz),public.kaban_history_settings(uuid,uuid),public.kaban_history_retention_set(uuid,uuid,integer,integer,text),public.kaban_history_clear(uuid,uuid,integer,bigint),public.kaban_prune_history(uuid) from public,anon,authenticated;
grant execute on function public.kaban_history_cutoff(integer,text,timestamptz),public.kaban_history_settings(uuid,uuid),public.kaban_history_retention_set(uuid,uuid,integer,integer,text),public.kaban_history_clear(uuid,uuid,integer,bigint),public.kaban_prune_history(uuid) to service_role;

-- Runs inside PostgreSQL, including while no app clients are connected.
create extension if not exists pg_cron;
select cron.schedule('kaban-history-retention','17 * * * *','select public.kaban_prune_history();');
notify pgrst,'reload schema';
commit;
