begin;
create table if not exists public.shared_cards (
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 encrypted_data jsonb not null,revision integer not null default 1,is_personal boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.shared_cards add column if not exists archived boolean not null default false;
create table if not exists public.shared_card_vaults (
 card_id uuid not null references public.shared_cards(id) on delete cascade,
 vault_id uuid not null references public.shared_vaults(id) on delete cascade,primary key(card_id,vault_id)
);
create index if not exists shared_card_vaults_vault on public.shared_card_vaults(vault_id);
alter table public.shared_cards enable row level security;
alter table public.shared_card_vaults enable row level security;
revoke all on public.shared_cards,public.shared_card_vaults from public,anon,authenticated;
grant all on public.shared_cards,public.shared_card_vaults to service_role;
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
notify pgrst,'reload schema';
commit;
