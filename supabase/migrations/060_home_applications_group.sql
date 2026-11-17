begin;
do $$
declare account record; row_item jsonb; card jsonb; cards jsonb; rows jsonb; hidden jsonb; shown boolean; was_hidden boolean;
begin
 for account in select user_id,layout from public.account_home_layouts for update loop
  rows:='[]';hidden:='[]';shown:=false;was_hidden:=false;
  for row_item in select value from jsonb_array_elements(account.layout->'rows') loop
   cards:='[]';
   for card in select value from jsonb_array_elements(row_item->'cards') loop
    if card#>>'{}' in ('wordcraft','pdfcraft','gridcraft','deckcraft','photocraft','applications') then
     if not shown then cards:=cards||'"applications"'::jsonb;shown:=true;end if;
    else cards:=cards||card;end if;
   end loop;
   if jsonb_array_length(cards)>0 then rows:=rows||jsonb_build_array(jsonb_set(row_item,'{cards}',cards));end if;
  end loop;
  for card in select value from jsonb_array_elements(account.layout->'hidden') loop
   if card#>>'{}' in ('wordcraft','pdfcraft','gridcraft','deckcraft','photocraft','applications') then was_hidden:=true;
   else hidden:=hidden||card;end if;
  end loop;
  if not shown then
   if was_hidden then hidden:=hidden||'"applications"'::jsonb;
   else rows:=rows||jsonb_build_array(jsonb_build_object('align','center','cards',jsonb_build_array('applications')));end if;
  end if;
  update public.account_home_layouts set layout=jsonb_build_object('version',1,'rows',rows,'hidden',hidden),revision=revision+1,updated_at=now() where user_id=account.user_id;
 end loop;
end $$;
commit;
