begin;
-- Resolve a current accessible placement for old links. Never use the live task
-- snapshot after a move if the recipient can only see its historical events.
create or replace function public.kaban_notification_events(p_actor uuid,p_keys text[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select distinct on(e.activity_key) e.*,b.vault_id,v.name vault_name,b.stages,target.vault_id target_vault_id,
 coalesce(case when target.board_id is not null then to_jsonb(t) end,(select coalesce(h.after_data,h.before_data) from public.kaban_events h where h.task_id=e.task_id and h.board_id=e.board_id and h.entity='task' and public.kaban_activity_visible(p_actor,h) order by h.id desc limit 1)) task_snapshot,
 target.board_id is not null task_available
 from public.kaban_events e join public.kaban_boards b on b.id=e.board_id left join public.shared_vaults v on v.id=b.vault_id left join public.kaban_tasks t on t.id=e.task_id
 left join lateral (select l.board_id,lb.vault_id from public.kaban_task_locations l join public.kaban_boards lb on lb.id=l.board_id where l.task_id=e.task_id and public.kaban_location_allowed(p_actor,l.board_id,l.category_ids) order by (l.board_id=e.board_id) desc,l.board_id limit 1) target on true
 where e.activity_key=any(p_keys) and e.actor_id<>p_actor and public.kaban_activity_visible(p_actor,e)
 order by e.activity_key,e.id desc
 ) x;
$$;
notify pgrst,'reload schema';
commit;
