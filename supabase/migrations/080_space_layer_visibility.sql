begin;

-- Ordinary object edits may come from clients that do not send layer metadata.
do $patch$
declare
  definition text;
  previous_strip constant text := 'end - array[''parentId'',''layerOrder''])';
  previous_preserve constant text := '''layerOrder'',data->''layerOrder'')),revision=revision+1';
begin
  select pg_get_functiondef('public.space_mutate(uuid,uuid,uuid,uuid,text,integer,jsonb)'::regprocedure) into definition;
  if strpos(definition, previous_strip) = 0 or strpos(definition, previous_preserve) = 0 then
    raise exception 'Unexpected space object writer';
  end if;
  definition := replace(definition, previous_strip, 'end - array[''parentId'',''layerOrder'',''layerHidden''])');
  definition := replace(definition, previous_preserve, '''layerOrder'',data->''layerOrder'',''layerHidden'',data->''layerHidden'')),revision=revision+1');
  execute definition;
end $patch$;

commit;
