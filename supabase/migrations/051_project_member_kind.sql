begin;
alter function public.project_mutate(uuid,text,uuid,integer,jsonb) rename to project_mutate_v49;
create function public.project_mutate(p_actor uuid,p_action text,p_id uuid,p_revision integer,p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.project_mutate_v49(p_actor,p_action,p_id,p_revision,p_payload);
 if p_action='member' and p_payload ? 'kind' then
  if p_payload->>'kind' not in ('executor','observer') then raise exception 'INVALID_PERMISSION';end if;
  update public.project_members set kind=p_payload->>'kind' where project_id=p_id and user_id=(p_payload->>'userId')::uuid;
 end if;
end $$;
revoke all on function public.project_mutate(uuid,text,uuid,integer,jsonb),public.project_mutate_v49(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.project_mutate_v49(uuid,text,uuid,integer,jsonb) from service_role;
grant execute on function public.project_mutate(uuid,text,uuid,integer,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
