begin;
alter table public.shared_vault_members add column if not exists category_ids text[];
alter table public.shared_vault_members add column if not exists access_token uuid not null default gen_random_uuid();
create or replace function public.shared_vault_mutate(p_actor uuid, p_action text, p_id uuid, p_revision integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.shared_vaults%rowtype;
  target uuid;
begin
  if p_action = 'create' then
    insert into public.shared_vaults(id, owner_id, name, encrypted_data) values (p_id, p_actor, p_payload->>'name', p_payload->'encryptedData');
    insert into public.shared_vault_members(vault_id,user_id) values (p_id, p_actor);
    perform public.notify_shared_change(p_actor,p_id,p_action);
    return jsonb_build_object('ok', true);
  end if;
  select * into v from public.shared_vaults where id = p_id for update;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  if not exists (select 1 from public.shared_vault_members where vault_id = p_id and user_id = p_actor) then raise exception 'ACCESS_DENIED'; end if;
  if p_action <> 'save' and v.owner_id <> p_actor then raise exception 'ACCESS_DENIED'; end if;
  if v.revision <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
  if p_action = 'save' then
    if not exists(select 1 from public.shared_vault_members where vault_id=p_id and user_id=p_actor and access_token::text=p_payload->>'accessToken') then raise exception 'REVISION_CONFLICT'; end if;
    update public.shared_vaults set encrypted_data = p_payload->'encryptedData' where id = p_id;
    update public.shared_vault_members set access_token=gen_random_uuid() where vault_id=p_id and category_ids is not null;
  elsif p_action = 'rename' then
    update public.shared_vaults set name = btrim(p_payload->>'name') where id = p_id;
  elsif p_action = 'invite' then
    select id into target from auth.users where lower(email) = lower(btrim(p_payload->>'email')) and deleted_at is null;
    if target is null then raise exception 'USER_NOT_FOUND'; end if;
    if exists (select 1 from public.shared_vault_members where vault_id = p_id and user_id = target) then raise exception 'ALREADY_MEMBER'; end if;
    insert into public.shared_vault_members(vault_id,user_id,category_ids) values(p_id,target,case when jsonb_typeof(p_payload->'categoryIds')='array' then array(select jsonb_array_elements_text(p_payload->'categoryIds')) else null end);
  elsif p_action = 'permissions' then
    target := (p_payload->>'userId')::uuid;
    if target=v.owner_id then raise exception 'OWNER_REQUIRED'; end if;
    update public.shared_vault_members set category_ids=case when jsonb_typeof(p_payload->'categoryIds')='array' then array(select jsonb_array_elements_text(p_payload->'categoryIds')) else null end,access_token=gen_random_uuid() where vault_id=p_id and user_id=target;
    if not found then raise exception 'USER_NOT_FOUND'; end if;
    delete from public.app_notifications where user_id=target and source_vault=p_id;
  elsif p_action = 'revoke' then
    target := (p_payload->>'userId')::uuid;
    if target = v.owner_id then raise exception 'OWNER_REQUIRED'; end if;
    if not exists (select 1 from public.shared_vault_members where vault_id = p_id and user_id = target) then raise exception 'ACCESS_DENIED'; end if;
    delete from public.shared_vault_members where vault_id = p_id and user_id = target;
    update public.shared_vaults set encrypted_data = p_payload->'encryptedData', key_epoch = key_epoch + 1 where id = p_id;
  else
    raise exception 'INVALID_ACTION';
  end if;
  update public.shared_vaults set revision = revision + 1, updated_at = now() where id = p_id;
  perform public.notify_shared_change(p_actor,p_id,p_action);
    return jsonb_build_object('ok', true);
end $$;
revoke all on function public.shared_vault_mutate(uuid,text,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.shared_vault_mutate(uuid,text,uuid,integer,jsonb) to service_role;

create or replace function public.shared_card_mutate(p_actor uuid,p_id uuid,p_revision integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.shared_cards%rowtype; v uuid; old_ids uuid[]; target_ids uuid[]; origin uuid; personal_rev integer; lock_ids uuid[];
begin
 select * into c from public.shared_cards where id=p_id for update;
 select coalesce(array_agg(vault_id order by vault_id),'{}'::uuid[]) into old_ids from public.shared_card_vaults where card_id=p_id;
 if c.id is not null then
  if not ((c.is_personal and c.owner_id=p_actor) or exists(select 1 from public.shared_vault_members where vault_id=any(old_ids) and user_id=p_actor)) then raise exception 'ACCESS_DENIED'; end if;
  if c.revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 elsif p_revision<>0 then raise exception 'ACCESS_DENIED';
 end if;
 if p_payload ? 'vaultIds' then
  select coalesce(array_agg(value::uuid order by value),'{}'::uuid[]) into target_ids from jsonb_array_elements_text(p_payload->'vaultIds');
  if c.id is not null and c.owner_id<>p_actor and target_ids<>old_ids then raise exception 'OWNER_REQUIRED'; end if;
 else target_ids:=old_ids;
 end if;
 if p_payload->>'action'='delete' then target_ids:='{}'::uuid[]; end if;
 lock_ids:=old_ids||target_ids;
 if p_payload ? 'originVault' and p_payload->>'originVault'<>'personal' then lock_ids:=array_append(lock_ids,(p_payload->>'originVault')::uuid); end if;
 -- Lock all affected vaults in a stable order. Recheck authorization under those locks.
 for v in select distinct value from unnest(lock_ids) value order by value loop
  perform 1 from public.shared_vaults where id=v for update;
 end loop;
 for v in select distinct value from unnest(lock_ids) value order by value loop
  if exists(select 1 from public.shared_vault_members where vault_id=v and user_id=p_actor) then
   if not exists(select 1 from public.shared_vault_members where vault_id=v and user_id=p_actor and access_token::text=p_payload->'accessTokens'->>v::text) then raise exception 'REVISION_CONFLICT'; end if;
  elsif coalesce(p_payload->'accessTokens','{}'::jsonb) ? v::text then raise exception 'REVISION_CONFLICT'; end if;
 end loop;
 if c.id is not null and not ((c.is_personal and c.owner_id=p_actor) or exists(select 1 from public.shared_vault_members where vault_id=any(old_ids) and user_id=p_actor)) then raise exception 'ACCESS_DENIED'; end if;
 if p_payload ? 'vaultIds' and (c.id is null or target_ids<>old_ids) then
  if exists(select 1 from unnest(target_ids) value where not exists(select 1 from public.shared_vault_members where vault_id=value and user_id=p_actor)) then raise exception 'ACCESS_DENIED'; end if;
 end if;
 if p_payload ? 'originVault' then
  if c.id is not null then raise exception 'REVISION_CONFLICT'; end if;
  if p_payload->>'originVault'='personal' then
   select revision into personal_rev from public.vaults where user_id=p_actor for update;
   if personal_rev is null or personal_rev<>(p_payload->>'originRevision')::integer then raise exception 'REVISION_CONFLICT'; end if;
   update public.vaults set encrypted_data=p_payload->'originEncrypted',revision=revision+1,updated_at=now() where user_id=p_actor;
  else
   origin:=(p_payload->>'originVault')::uuid;
   perform 1 from public.shared_vaults where id=origin for update;
   if not exists(select 1 from public.shared_vault_members where vault_id=origin and user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
   if (select revision from public.shared_vaults where id=origin)<>(p_payload->>'originRevision')::integer then raise exception 'REVISION_CONFLICT'; end if;
   update public.shared_vaults set encrypted_data=p_payload->'originEncrypted',revision=revision+1,updated_at=now() where id=origin;
   perform public.notify_shared_change(p_actor,origin,'save');
  end if;
 end if;
 if p_payload->>'action'='delete' then
  if p_payload ? 'encryptedData' then
   update public.shared_cards set encrypted_data=p_payload->'encryptedData',archived=true,revision=revision+1,updated_at=now() where id=p_id;
  else delete from public.shared_cards where id=p_id; end if;
 elsif c.id is null then
  insert into public.shared_cards(id,owner_id,encrypted_data,is_personal) values(p_id,p_actor,p_payload->'encryptedData',cardinality(target_ids)=0);
  insert into public.shared_card_vaults select p_id,value from unnest(target_ids) value;
 else
  update public.shared_cards set encrypted_data=p_payload->'encryptedData',revision=revision+1,updated_at=now(),is_personal=case when p_payload ? 'vaultIds' then cardinality(target_ids)=0 else is_personal end where id=p_id;
  if p_payload ? 'vaultIds' then
   delete from public.shared_card_vaults where card_id=p_id;
   insert into public.shared_card_vaults select p_id,value from unnest(target_ids) value;
  end if;
 end if;
 for v in select distinct value from unnest(old_ids||target_ids) value order by value loop
  update public.shared_vaults set revision=revision+1,updated_at=now() where id=v;
  perform public.notify_shared_change(p_actor,v,'save');
 end loop;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.shared_card_mutate(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.shared_card_mutate(uuid,uuid,integer,jsonb) to service_role;
drop function if exists public.shared_vault_directory(uuid);
create or replace function public.shared_vault_directory(p_actor uuid)
returns table(vault_id uuid,user_id uuid,email text,brand text,category_ids text[])
language sql stable security definer set search_path='' as $$
 select m.vault_id,m.user_id,u.email::text,case when u.raw_user_meta_data->>'account_brand'='light' then 'light' else 'magnat' end,m.category_ids
 from public.shared_vault_members m join auth.users u on u.id=m.user_id
 where exists(select 1 from public.shared_vault_members mine where mine.vault_id=m.vault_id and mine.user_id=p_actor);
$$;
revoke all on function public.shared_vault_directory(uuid) from public,anon,authenticated;
grant execute on function public.shared_vault_directory(uuid) to service_role;
notify pgrst,'reload schema';
commit;
