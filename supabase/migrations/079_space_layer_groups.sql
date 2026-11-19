begin;

create function public.space_layer_groups_write(
  p_actor uuid, p_project uuid, p_space uuid, p_group jsonb, p_remove jsonb, p_changes jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  group_id uuid;
  changes jsonb := p_changes;
begin
  perform 1 from public.project_spaces where id = p_space and project_id = p_project for update;
  if not found or coalesce(public.space_permission(p_actor, p_space), '') not in ('owner', 'editor') then
    raise exception 'ACCESS_DENIED';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_remove) r
    where not exists (
      select 1 from public.project_space_objects o
      where o.space_id = p_space and o.id = (r->>'id')::uuid
        and o.revision = (r->>'revision')::integer and o.data->>'layerGroup' = 'true'
    )
  ) then raise exception 'REVISION_CONFLICT'; end if;

  if jsonb_typeof(p_group) = 'object' then
    group_id := (p_group->>'id')::uuid;
    insert into public.project_space_objects(id, space_id, data, revision)
    values(group_id, p_space, (p_group - array['id','parentId','layerOrder']) ||
      jsonb_build_object('kind', 'frame', 'layerGroup', true, 'text', 'Группа'), 1);
    changes := changes || jsonb_build_array(jsonb_build_object(
      'id', group_id, 'revision', 1, 'parentId', p_group->'parentId', 'layerOrder', p_group->'layerOrder'
    ));
  end if;

  perform public.space_layers_write(p_actor, p_project, p_space, changes);

  -- A concurrently added child must remain attached unless the caller explicitly moved it.
  if exists (
    with removed as (select r->>'id' as id from jsonb_array_elements(p_remove) r)
    select 1 from public.project_space_objects o
    where o.space_id = p_space and o.id::text not in (select id from removed)
      and (o.data->>'parentId' in (select id from removed)
        or o.data->>'from' in (select id from removed) or o.data->>'to' in (select id from removed))
  ) then raise exception 'REVISION_CONFLICT'; end if;

  delete from public.project_space_objects o using jsonb_array_elements(p_remove) r
  where o.space_id = p_space and o.id = (r->>'id')::uuid;
end $$;

revoke all on function public.space_layer_groups_write(uuid, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.space_layer_groups_write(uuid, uuid, uuid, jsonb, jsonb, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
