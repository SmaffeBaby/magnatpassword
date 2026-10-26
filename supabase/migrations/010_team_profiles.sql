begin;
create table if not exists public.team_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '' check(length(full_name)<=120),
 account_email text not null default '', work_email text not null default '' check(length(work_email)<=254),
 telegram text not null default '' check(telegram='' or telegram ~ '^[a-z][a-z0-9_]{4,31}$'),
 brand text not null default 'magnat' check(brand in ('magnat','light')),
 avatar_path text,updated_at timestamptz not null default now()
);
create table if not exists public.team_units (
 id uuid primary key default gen_random_uuid(),parent_id uuid references public.team_units(id) on delete restrict,
 name text not null check(length(btrim(name)) between 1 and 80),kind text not null check(kind in ('company','department','role')),
 brand text check(brand in ('magnat','light')),created_at timestamptz not null default now(),
 check((kind='company' and parent_id is null) or (kind<>'company' and parent_id is not null))
);
create unique index if not exists team_unit_unique_name on public.team_units(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name));
create table if not exists public.team_role_eligibility (
 user_id uuid not null references public.team_profiles(user_id) on delete cascade,
 role_id uuid not null references public.team_units(id) on delete restrict,primary key(user_id,role_id)
);
create table if not exists public.team_role_assignments (
 user_id uuid not null,role_id uuid not null,primary key(user_id,role_id),
 foreign key(user_id,role_id) references public.team_role_eligibility(user_id,role_id) on delete cascade
);
create or replace function public.check_team_unit() returns trigger language plpgsql set search_path='' as $$
declare parent_kind text;
begin
 if tg_op='UPDATE' and new.kind<>old.kind then raise exception 'INVALID_UNIT'; end if;
 if new.parent_id is not null then
  select kind into parent_kind from public.team_units where id=new.parent_id;
  if not ((new.kind='department' and parent_kind='company') or (new.kind='role' and parent_kind='department')) then raise exception 'INVALID_UNIT'; end if;
 end if;
 return new;
end $$;
drop trigger if exists check_team_unit on public.team_units;
create trigger check_team_unit before insert or update on public.team_units for each row execute function public.check_team_unit();
create or replace function public.sync_team_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.team_profiles(user_id,account_email,brand,full_name)
 values(new.id,coalesce(new.email,''),case when new.raw_user_meta_data->>'account_brand'='light' then 'light' else 'magnat' end,left(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',''),120))
 on conflict(user_id) do update set account_email=excluded.account_email,brand=excluded.brand;
 return new;
end $$;
drop trigger if exists sync_team_profile on auth.users;
create trigger sync_team_profile after insert or update of email,raw_user_meta_data on auth.users for each row execute function public.sync_team_profile();
insert into public.team_profiles(user_id,account_email,brand,full_name)
 select id,coalesce(email,''),case when raw_user_meta_data->>'account_brand'='light' then 'light' else 'magnat' end,left(coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name',''),120) from auth.users where deleted_at is null
 on conflict(user_id) do nothing;
insert into public.team_units(id,name,kind,brand) values('a0000000-0000-4000-8000-000000000001','Magnat','company','magnat'),('a0000000-0000-4000-8000-000000000002','Light','company','light') on conflict(id) do nothing;
drop function if exists public.update_team_profile(uuid,jsonb,uuid[]);
drop function if exists public.set_team_eligibility(uuid,uuid,uuid[],uuid[]);
create or replace function public.update_team_profile(p_actor uuid,p_profile jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.team_profiles set full_name=p_profile->>'fullName',work_email=p_profile->>'workEmail',telegram=p_profile->>'telegram',updated_at=now() where user_id=p_actor;
end $$;
create or replace function public.set_team_assignments(p_actor uuid,p_user uuid,p_roles uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.site_admins where user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 perform 1 from public.team_profiles where user_id=p_user for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 if exists(select 1 from unnest(p_roles) r where not exists(select 1 from public.team_units where id=r)) then raise exception 'INVALID_ROLE'; end if;
 delete from public.team_role_eligibility where user_id=p_user and not(role_id=any(p_roles));
 insert into public.team_role_eligibility select p_user,r from (select distinct unnest(p_roles) r) q on conflict do nothing;
 delete from public.team_role_assignments where user_id=p_user;
 insert into public.team_role_assignments select p_user,r from (select distinct unnest(p_roles) r) q;
end $$;
alter table public.shared_vault_members add column if not exists member_role text not null default 'member' check(member_role in ('viewer','member','manager'));
create or replace function public.team_common_vaults(p_actor uuid,p_target uuid) returns table(id uuid,name text,member_role text,owner boolean) language sql stable security definer set search_path='' as $$
 select v.id,v.name,target.member_role,v.owner_id=p_target from public.shared_vaults v
 join public.shared_vault_members mine on mine.vault_id=v.id and mine.user_id=p_actor
 join public.shared_vault_members target on target.vault_id=v.id and target.user_id=p_target;
$$;
create or replace function public.shared_vault_mutate(p_actor uuid, p_action text, p_id uuid, p_revision integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.shared_vaults%rowtype;
  target uuid;
  actor_role text;
  target_role text;
  next_role text;
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
  select member_role into actor_role from public.shared_vault_members where vault_id=p_id and user_id=p_actor;
  if actor_role='viewer' then raise exception 'ACCESS_DENIED'; end if;
  if p_action <> 'save' and v.owner_id <> p_actor and actor_role<>'manager' then raise exception 'ACCESS_DENIED'; end if;
  next_role:=coalesce(p_payload->>'role','member');
  if next_role not in ('viewer','member','manager') then raise exception 'ACCESS_DENIED'; end if;
  if p_action in ('invite','permissions') and next_role='manager' and v.owner_id<>p_actor then raise exception 'ACCESS_DENIED'; end if;
  if p_action in ('permissions','revoke') then
    target:=(p_payload->>'userId')::uuid;
    select member_role into target_role from public.shared_vault_members where vault_id=p_id and user_id=target;
    if target=v.owner_id or (v.owner_id<>p_actor and (target=p_actor or target_role='manager')) then raise exception 'ACCESS_DENIED'; end if;
  end if;
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
    insert into public.shared_vault_members(vault_id,user_id,member_role,category_ids) values(p_id,target,next_role,case when next_role<>'manager' and jsonb_typeof(p_payload->'categoryIds')='array' then array(select jsonb_array_elements_text(p_payload->'categoryIds')) else null end);
  elsif p_action = 'permissions' then
    target := (p_payload->>'userId')::uuid;
    if target=v.owner_id then raise exception 'OWNER_REQUIRED'; end if;
    update public.shared_vault_members set member_role=next_role,category_ids=case when next_role<>'manager' and jsonb_typeof(p_payload->'categoryIds')='array' then array(select jsonb_array_elements_text(p_payload->'categoryIds')) else null end,access_token=gen_random_uuid() where vault_id=p_id and user_id=target;
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
  if not ((c.is_personal and c.owner_id=p_actor) or exists(select 1 from public.shared_vault_members where vault_id=any(old_ids) and user_id=p_actor and member_role<>'viewer')) then raise exception 'ACCESS_DENIED'; end if;
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
 if c.id is not null and not ((c.is_personal and c.owner_id=p_actor) or exists(select 1 from public.shared_vault_members where vault_id=any(old_ids) and user_id=p_actor and member_role<>'viewer')) then raise exception 'ACCESS_DENIED'; end if;
 if p_payload ? 'vaultIds' and (c.id is null or target_ids<>old_ids) then
  if exists(select 1 from unnest(target_ids) value where not exists(select 1 from public.shared_vault_members where vault_id=value and user_id=p_actor and member_role<>'viewer')) then raise exception 'ACCESS_DENIED'; end if;
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
   if not exists(select 1 from public.shared_vault_members where vault_id=origin and user_id=p_actor and member_role<>'viewer') then raise exception 'ACCESS_DENIED'; end if;
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
returns table(vault_id uuid,user_id uuid,email text,brand text,category_ids text[],member_role text,full_name text)
language sql stable security definer set search_path='' as $$
 select m.vault_id,m.user_id,u.email::text,coalesce(p.brand,'magnat'),m.category_ids,m.member_role,coalesce(p.full_name,'')
 from public.shared_vault_members m join auth.users u on u.id=m.user_id left join public.team_profiles p on p.user_id=m.user_id
 where exists(select 1 from public.shared_vault_members mine where mine.vault_id=m.vault_id and mine.user_id=p_actor);
$$;
create or replace function public.search_team(p_actor uuid,p_query text,p_limit integer default 50,p_offset integer default 0,p_company uuid default null)
returns table(user_id uuid,full_name text,account_email text,work_email text,telegram text,brand text,avatar_path text,role_ids uuid[],common_vault_count bigint,total bigint)
language sql stable security definer set search_path='' as $$
 select p.user_id,p.full_name,p.account_email,p.work_email,p.telegram,p.brand,p.avatar_path,
 coalesce((select array_agg(a.role_id) from public.team_role_assignments a where a.user_id=p.user_id),'{}'::uuid[]),
 (select count(*) from public.shared_vault_members target join public.shared_vault_members mine on mine.vault_id=target.vault_id and mine.user_id=p_actor where target.user_id=p.user_id),
 count(*) over()
 from public.team_profiles p join auth.users u on u.id=p.user_id and u.deleted_at is null
 where not exists(select 1 from regexp_split_to_table(lower(btrim(p_query)),E'\\s+') token where token<>'' and strpos(lower(concat_ws(' ',p.full_name,p.account_email,p.work_email,p.telegram)),token)=0)
 and (p_company is null or exists(select 1 from public.team_role_assignments a join public.team_units r on r.id=a.role_id left join public.team_units d on d.id=r.parent_id where a.user_id=p.user_id and (r.id=p_company or r.parent_id=p_company or d.parent_id=p_company)) or (not exists(select 1 from public.team_role_assignments a where a.user_id=p.user_id) and exists(select 1 from public.team_units company where company.id=p_company and company.brand=p.brand)))
 order by case when lower(p.account_email)=lower(btrim(p_query)) or lower(p.telegram)=lower(btrim(p_query)) then 0 else 1 end,coalesce(nullif(p.full_name,''),p.account_email),p.user_id
 limit greatest(1,least(p_limit,100)) offset greatest(0,p_offset);
$$;
revoke all on function public.search_team(uuid,text,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.search_team(uuid,text,integer,integer,uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-avatars','profile-avatars',false,2097152,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
alter table public.team_profiles enable row level security;
alter table public.team_units enable row level security;
alter table public.team_role_assignments enable row level security;
alter table public.team_role_eligibility enable row level security;
revoke all on public.team_profiles,public.team_units,public.team_role_assignments,public.team_role_eligibility from public,anon,authenticated;
grant all on public.team_profiles,public.team_units,public.team_role_assignments,public.team_role_eligibility to service_role;
revoke all on function public.update_team_profile(uuid,jsonb),public.set_team_assignments(uuid,uuid,uuid[]),public.team_common_vaults(uuid,uuid),public.shared_vault_directory(uuid) from public,anon,authenticated;
grant execute on function public.update_team_profile(uuid,jsonb),public.set_team_assignments(uuid,uuid,uuid[]),public.team_common_vaults(uuid,uuid),public.shared_vault_directory(uuid) to service_role;
notify pgrst,'reload schema';
commit;
