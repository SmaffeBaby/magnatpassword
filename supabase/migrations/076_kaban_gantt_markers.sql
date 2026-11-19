begin;

create table public.kaban_gantt_markers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  day date not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  revision integer not null default 1
);
create index kaban_gantt_markers_project_idx on public.kaban_gantt_markers(project_id);
alter table public.kaban_gantt_markers enable row level security;
revoke all on public.kaban_gantt_markers from public, anon, authenticated;

create function public.kaban_gantt_markers_list(p_actor uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg((to_jsonb(m) - 'project_id') || jsonb_build_object('projectId', m.project_id) order by m.day, m.id), '[]'::jsonb)
  from public.projects p
  join public.kaban_gantt_markers m on m.project_id = p.id
  where exists (select 1 from public.project_access where user_id = p_actor)
    and p.profile->>'archived' is distinct from 'true'
    and public.project_section_permission(p_actor, p.id, 'tasks') in ('owner', 'editor', 'viewer');
$$;

create function public.kaban_gantt_marker_mutate(
  p_actor uuid, p_project uuid, p_action text, p_marker uuid, p_revision integer,
  p_day date, p_title text, p_color text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  marker public.kaban_gantt_markers%rowtype;
begin
  perform 1 from public.project_access where user_id = p_actor for share;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  perform 1 from public.projects where id = p_project and profile->>'archived' is distinct from 'true' for share;
  if not found or coalesce(public.project_section_permission(p_actor, p_project, 'tasks'), 'hidden') not in ('owner', 'editor') then
    raise exception 'ACCESS_DENIED';
  end if;

  case p_action
    when 'create' then
      insert into public.kaban_gantt_markers(project_id, day, title, color)
      values (p_project, p_day, btrim(p_title), p_color) returning * into marker;
    when 'update' then
      update public.kaban_gantt_markers
      set day = p_day, title = btrim(p_title), color = p_color, revision = revision + 1
      where id = p_marker and project_id = p_project and revision = p_revision returning * into marker;
    when 'delete' then
      delete from public.kaban_gantt_markers
      where id = p_marker and project_id = p_project and revision = p_revision returning * into marker;
    else raise exception 'INVALID_ACTION';
  end case;
  if marker.id is null then raise exception 'REVISION_CONFLICT'; end if;
  return (to_jsonb(marker) - 'project_id') || jsonb_build_object('projectId', marker.project_id);
end;
$$;

revoke all on function public.kaban_gantt_markers_list(uuid),
  public.kaban_gantt_marker_mutate(uuid, uuid, text, uuid, integer, date, text, text) from public, anon, authenticated;
grant execute on function public.kaban_gantt_markers_list(uuid),
  public.kaban_gantt_marker_mutate(uuid, uuid, text, uuid, integer, date, text, text) to service_role;
notify pgrst, 'reload schema';
commit;
