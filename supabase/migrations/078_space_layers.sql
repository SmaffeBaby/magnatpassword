begin;

create function public.space_layers_write(p_actor uuid, p_project uuid, p_space uuid, p_changes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.project_spaces where id = p_space and project_id = p_project for update;
  if not found or coalesce(public.space_permission(p_actor, p_space), '') not in ('owner', 'editor') then
    raise exception 'ACCESS_DENIED';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_changes) c
    where not exists (
      select 1 from public.project_space_objects o
      where o.space_id = p_space and o.id = (c->>'id')::uuid and o.revision = (c->>'revision')::integer
    )
  ) then raise exception 'REVISION_CONFLICT'; end if;

  if exists (
    with recursive changes as (
      select (c->>'id')::uuid as id, c->>'parentId' as parent
      from jsonb_array_elements(p_changes) c where c ? 'parentId'
    ), nodes as (
      select o.id::text as id, o.data->>'kind' as kind,
        case when c.id is not null then c.parent else o.data->>'parentId' end as parent
      from public.project_space_objects o left join changes c on c.id = o.id where o.space_id = p_space
    ), ancestors(id, next_parent, path, invalid) as (
      select c.id::text, c.parent, array[c.id::text], false from changes c where c.parent is not null
      union all
      select a.id, n.parent, a.path || a.next_parent,
        coalesce(n.kind, '') <> 'frame' or a.next_parent = any(a.path)
      from ancestors a left join nodes n on n.id = a.next_parent
      where not a.invalid and a.next_parent is not null
    )
    select 1 from ancestors where invalid
  ) then raise exception 'INVALID_SPACE_LAYER'; end if;

  update public.project_space_objects o
  set data = case when c ? 'parentId' and c->>'parentId' is null
    then (o.data - 'parentId') || (c - array['id','revision','parentId'])
    else o.data || (c - array['id','revision']) end, revision = o.revision + 1
  from jsonb_array_elements(p_changes) c
  where o.space_id = p_space and o.id = (c->>'id')::uuid;
end $$;

-- Older clients also send a full object on ordinary edits. Keep the stored layer metadata intact.
do $patch$
declare
  definition text;
  previous_insert constant text := 'insert into public.project_space_objects values(p_id,p_space,p_data,1);';
  update_start constant text := 'set data=case when data->>''kind''=''comment''';
  previous_update constant text := 'else p_data end,revision=revision+1';
begin
  select pg_get_functiondef('public.space_mutate(uuid,uuid,uuid,uuid,text,integer,jsonb)'::regprocedure) into definition;
  if strpos(definition, previous_insert) = 0 or strpos(definition, update_start) = 0 or strpos(definition, previous_update) = 0 then
    raise exception 'Unexpected space object writer';
  end if;
  definition := replace(definition, previous_insert, $sql$
    insert into public.project_space_objects values(p_id,p_space,(p_data - array['parentId','layerOrder']) ||
      case when p_data->>'kind' = 'frame' then '{}'::jsonb
        else jsonb_build_object('layerOrder', coalesce((select max((data->>'layerOrder')::integer)
          from public.project_space_objects where space_id = p_space), 2) + 1) end,1);
  $sql$);
  definition := replace(definition, update_start, 'set data=(case when data->>''kind''=''comment''');
  definition := replace(definition, previous_update, $sql$else p_data end - array['parentId','layerOrder']) ||
    jsonb_strip_nulls(jsonb_build_object('parentId',data->'parentId','layerOrder',data->'layerOrder')),revision=revision+1$sql$);
  execute definition;
end $patch$;

revoke all on function public.space_layers_write(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.space_layers_write(uuid, uuid, uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
