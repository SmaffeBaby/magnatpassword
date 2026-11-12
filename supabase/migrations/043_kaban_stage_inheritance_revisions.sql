begin;
-- Inherited drafts must become stale when their source definition changes.
create function public.kaban_stage_inheritance_revisions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='kaban_categories' then
  if old.stages is not distinct from new.stages and old.parent_id is not distinct from new.parent_id then return null;end if;
  with recursive children as (
   select id from public.kaban_categories where board_id=new.board_id and parent_id=new.id and stages is null
   union all select c.id from public.kaban_categories c join children p on c.parent_id=p.id where c.board_id=new.board_id and c.stages is null
  ) update public.kaban_categories set revision=revision+1 where board_id=new.board_id and id in(select id from children);
 else
  if old.default_stages is not distinct from new.default_stages then return null;end if;
  with recursive inherited as (
   select id from public.kaban_categories where board_id=new.id and parent_id is null and stages is null
   union all select c.id from public.kaban_categories c join inherited p on c.parent_id=p.id where c.board_id=new.id and c.stages is null
  ) update public.kaban_categories set revision=revision+1 where board_id=new.id and id in(select id from inherited);
 end if;
 return null;
end $$;
create trigger kaban_category_stage_revisions after update of stages,parent_id on public.kaban_categories for each row execute function public.kaban_stage_inheritance_revisions();
create trigger kaban_default_stage_revisions after update of default_stages on public.kaban_boards for each row execute function public.kaban_stage_inheritance_revisions();
revoke all on function public.kaban_stage_inheritance_revisions() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
