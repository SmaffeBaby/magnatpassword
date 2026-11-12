begin;
create table public.registry_file_cleanup (
 id uuid primary key,contract_id uuid not null
);
alter table public.registry_file_cleanup enable row level security;
revoke all on public.registry_file_cleanup from public,anon,authenticated;
grant all on public.registry_file_cleanup to service_role;
create function public.registry_contract_delete(p_actor uuid,p_id uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.registry_contracts%rowtype; files jsonb;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED';end if;
 select * into c from public.registry_contracts where id=p_id for update;
 if not found then raise exception 'CONTRACT_NOT_FOUND';end if;
 if c.owner_id is distinct from p_actor then raise exception 'ACCESS_DENIED';end if;
 if c.revision<>p_revision then raise exception 'REVISION_CONFLICT';end if;
 select coalesce(jsonb_agg(id),'[]'::jsonb) into files from public.registry_contract_files where contract_id=p_id;
 insert into public.registry_file_cleanup(id,contract_id) select id,contract_id from public.registry_contract_files where contract_id=p_id;
 delete from public.registry_contract_files where contract_id=p_id;
 delete from public.registry_contracts where id=p_id;
 return jsonb_build_object('fileIds',files);
end $$;
revoke all on function public.registry_contract_delete(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.registry_contract_delete(uuid,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
