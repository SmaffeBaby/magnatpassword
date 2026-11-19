begin;

-- Category-specific stages can be edited with write access to project tasks.
-- Shared-vault stages and project-wide defaults still require board management.
do $patch$
declare
  definition text;
  previous_guard constant text := 'perform public.kaban_check(p_actor,p_board,true,true);';
  category_guard constant text := $guard$
 if exists(select 1 from public.kaban_boards where id=p_board and project_id is not null) then
  perform 1 from public.project_access where user_id=p_actor for share;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  perform public.kaban_check(p_actor,p_board,true,false);
 else
  perform public.kaban_check(p_actor,p_board,true,true);
 end if;
$guard$;
begin
  select pg_get_functiondef('public.kaban_category_stages_write(uuid,uuid,text,integer,jsonb,boolean)'::regprocedure) into definition;
  if strpos(definition, previous_guard) = 0 then
    raise exception 'Unexpected Kanban category stage permission check';
  end if;
  execute replace(definition, previous_guard, category_guard);
end $patch$;

notify pgrst, 'reload schema';
commit;
