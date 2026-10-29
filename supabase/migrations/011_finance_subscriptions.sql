-- Extract subscriptions and payments together. A revision conflict rolls back the entire source.
create or replace function public.finance_extract_subscriptions(p_actor uuid,p_source text,p_id uuid,p_revision integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.shared_cards%rowtype; v public.shared_vaults%rowtype; item jsonb; child_id uuid; child_owner uuid; personal boolean; target uuid;
begin
 if p_source='card' then
  select * into c from public.shared_cards where id=p_id for update;
  if c.id is null or c.archived or c.revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
  -- This performs permission and access-token checks while holding the relevant locks.
  perform public.shared_card_mutate(p_actor,p_id,p_revision,jsonb_build_object('encryptedData',p_payload->'encryptedData','accessTokens',p_payload->'accessTokens'));
  child_owner:=c.owner_id; personal:=c.is_personal;
 elsif p_source='personal' then
  if p_id<>p_actor then raise exception 'ACCESS_DENIED'; end if;
  perform 1 from public.vaults where user_id=p_actor and revision=p_revision and encryption_mode='server' for update;
  if not found then raise exception 'REVISION_CONFLICT'; end if;
  update public.vaults set encrypted_data=p_payload->'encryptedData',revision=revision+1,updated_at=now() where user_id=p_actor;
  child_owner:=p_actor; personal:=true;
 elsif p_source='vault' then
  select * into v from public.shared_vaults where id=p_id for update;
  if v.id is null or v.revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
  if not exists(select 1 from public.shared_vault_members where vault_id=p_id and user_id=p_actor and member_role<>'viewer' and access_token::text=p_payload->'accessTokens'->>p_id::text) then raise exception 'ACCESS_DENIED'; end if;
  update public.shared_vaults set encrypted_data=p_payload->'encryptedData',revision=revision+1,updated_at=now() where id=p_id;
  child_owner:=v.owner_id; personal:=false;
 else raise exception 'INVALID_SOURCE';
 end if;
 for item in select value from jsonb_array_elements(p_payload->'children') loop
  child_id:=(item->>'id')::uuid;
  insert into public.shared_cards(id,owner_id,encrypted_data,is_personal) values(child_id,child_owner,item->'encryptedData',personal);
  if p_source='card' then
   insert into public.shared_card_vaults(card_id,vault_id) select child_id,vault_id from public.shared_card_vaults where card_id=p_id;
  elsif p_source='vault' then
   insert into public.shared_card_vaults(card_id,vault_id) values(child_id,p_id);
  end if;
 end loop;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.finance_extract_subscriptions(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.finance_extract_subscriptions(uuid,text,uuid,integer,jsonb) to service_role;
