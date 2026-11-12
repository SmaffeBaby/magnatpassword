begin;
-- Preserve users' row order and hidden services while adding the new service.
update public.account_home_layouts set
 layout=case when jsonb_array_length(layout->'rows')>0 then
  jsonb_set(layout,array['rows','0','cards'],(layout->'rows'->0->'cards')||'"contracts"'::jsonb)
 else jsonb_set(layout,'{rows}','[{"align":"center","cards":["contracts"]}]'::jsonb) end,
 revision=revision+1,updated_at=now()
where not jsonb_path_exists(layout,'$.rows[*].cards[*] ? (@ == "contracts")')
 and not (layout->'hidden' ? 'contracts');
commit;
