begin;
do $$
begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='team_profiles' and column_name='is_hidden') then
  alter table public.team_profiles add column is_hidden boolean not null default false;
  update public.team_profiles set is_hidden=true,updated_at=now() where lower(account_email) in ('admin@magnat.local','mark230602@gmail.com');
 end if;
end $$;
drop function if exists public.search_team(uuid,text,integer,integer,uuid);
create or replace function public.search_team(p_actor uuid,p_query text,p_limit integer default 50,p_offset integer default 0,p_company uuid default null,p_include_hidden boolean default false)
returns table(user_id uuid,full_name text,account_email text,work_email text,telegram text,brand text,avatar_path text,is_hidden boolean,role_ids uuid[],common_vault_count bigint,total bigint)
language sql stable security definer set search_path='' as $$
 select p.user_id,p.full_name,p.account_email,p.work_email,p.telegram,p.brand,p.avatar_path,p.is_hidden,
 coalesce((select array_agg(a.role_id) from public.team_role_assignments a where a.user_id=p.user_id),'{}'::uuid[]),
 (select count(*) from public.shared_vault_members target join public.shared_vault_members mine on mine.vault_id=target.vault_id and mine.user_id=p_actor where target.user_id=p.user_id),
 count(*) over()
 from public.team_profiles p join auth.users u on u.id=p.user_id and u.deleted_at is null
 where (not p.is_hidden or (p_include_hidden and exists(select 1 from public.site_admins where user_id=p_actor)))
 and not exists(select 1 from regexp_split_to_table(lower(btrim(p_query)),E'\\s+') token where token<>'' and strpos(lower(concat_ws(' ',p.full_name,p.account_email,p.work_email,p.telegram)),token)=0)
 and (p_company is null or exists(select 1 from public.team_role_assignments a join public.team_units r on r.id=a.role_id left join public.team_units d on d.id=r.parent_id where a.user_id=p.user_id and (r.id=p_company or r.parent_id=p_company or d.parent_id=p_company)) or (not exists(select 1 from public.team_role_assignments a where a.user_id=p.user_id) and exists(select 1 from public.team_units company where company.id=p_company and company.brand=p.brand)))
 order by case when lower(p.account_email)=lower(btrim(p_query)) or lower(p.telegram)=lower(btrim(p_query)) then 0 else 1 end,coalesce(nullif(p.full_name,''),p.account_email),p.user_id
 limit greatest(1,least(p_limit,100)) offset greatest(0,p_offset);
$$;
revoke all on function public.search_team(uuid,text,integer,integer,uuid,boolean) from public,anon,authenticated;
grant execute on function public.search_team(uuid,text,integer,integer,uuid,boolean) to service_role;

notify pgrst,'reload schema';
commit;
