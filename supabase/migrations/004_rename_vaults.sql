begin;
create or replace function public.shared_vault_mutate(p_actor uuid, p_action text, p_id uuid, p_revision integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.shared_vaults%rowtype;
  target uuid;
begin
  if p_action = 'create' then
    insert into public.shared_vaults(id, owner_id, name, encrypted_data) values (p_id, p_actor, p_payload->>'name', p_payload->'encryptedData');
    insert into public.shared_vault_members values (p_id, p_actor);
    return jsonb_build_object('ok', true);
  end if;
  select * into v from public.shared_vaults where id = p_id for update;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  if not exists (select 1 from public.shared_vault_members where vault_id = p_id and user_id = p_actor) then raise exception 'ACCESS_DENIED'; end if;
  if p_action <> 'save' and v.owner_id <> p_actor then raise exception 'ACCESS_DENIED'; end if;
  if v.revision <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
  if p_action = 'save' then
    update public.shared_vaults set encrypted_data = p_payload->'encryptedData' where id = p_id;
  elsif p_action = 'rename' then
    update public.shared_vaults set name = btrim(p_payload->>'name') where id = p_id;
  elsif p_action = 'invite' then
    select id into target from auth.users where lower(email) = lower(btrim(p_payload->>'email')) and deleted_at is null;
    if target is null then raise exception 'USER_NOT_FOUND'; end if;
    if exists (select 1 from public.shared_vault_members where vault_id = p_id and user_id = target) then raise exception 'ALREADY_MEMBER'; end if;
    insert into public.shared_vault_members(vault_id, user_id) values (p_id, target);
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
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.shared_vault_mutate(uuid,text,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.shared_vault_mutate(uuid,text,uuid,integer,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
