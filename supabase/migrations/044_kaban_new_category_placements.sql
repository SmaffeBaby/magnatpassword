begin;
create or replace function public.kaban_location_stage_map() returns trigger language plpgsql set search_path='' as $$
declare cat text; defs jsonb; chosen text; source jsonb; result jsonb:='{}';
begin
 for cat in select unnest(new.category_ids) loop
  chosen:=new.category_stage_ids->>cat;
  if chosen is null then
   defs:=public.kaban_category_stages(new.board_id,cat);
   select s into source from public.kaban_boards b cross join lateral jsonb_array_elements(b.stages) s where b.id=new.board_id and s->>'id'=new.stage_id::text;
   select s->>'id' into chosen from jsonb_array_elements(defs) with ordinality x(s,n)
   order by (s->>'id'=new.stage_id::text) desc,(s->>'name'=source->>'name' and s->>'done'=source->>'done') desc,(not (s->>'done')::boolean) desc,n limit 1;
  end if;
  result:=result||jsonb_build_object(cat,chosen);
 end loop;
 new.category_stage_ids:=result;
 return new;
end $$;
notify pgrst,'reload schema';
commit;
