begin;
-- A viewer duplicating an overview must not discover hidden memberships.
do $patch$ declare def text;begin
 select pg_get_functiondef('public.project_workspace_action(uuid,uuid,integer,text,jsonb)'::regprocedure) into def;
 def:=replace(def,'where project_id=p_id and user_id<>p_actor;', 'where project_id=p_id and user_id<>p_actor and (rights=''owner'' or permission<>''hidden'');');
 execute def;
end $patch$;
notify pgrst,'reload schema';
commit;
