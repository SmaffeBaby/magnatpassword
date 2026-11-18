begin;

create table public.project_document_history (
 document_id uuid not null references public.project_documents(id) on delete cascade,
 revision integer not null,
 action text not null check (action in ('create','replace','metadata','move','access','legacy')),
 actor_id uuid references auth.users(id) on delete set null,
 actor_name text,
 changed_at timestamptz not null,
 primary key(document_id,revision)
);
alter table public.project_document_history enable row level security;
revoke all on public.project_document_history from public,anon,authenticated;

insert into public.project_document_history(document_id,revision,action,actor_id,actor_name,changed_at)
select d.id,1,'create',d.created_by,nullif(btrim(t.full_name),''),d.created_at
from public.project_documents d left join public.team_profiles t on t.user_id=d.created_by;
insert into public.project_document_history(document_id,revision,action,changed_at)
select id,revision,'legacy',updated_at from public.project_documents where revision>1;

alter function public.project_document_mutate(uuid,uuid,uuid,integer,text,jsonb) rename to project_document_mutate_v56;
revoke all on function public.project_document_mutate_v56(uuid,uuid,uuid,integer,text,jsonb), public.project_document_mutate_v55(uuid,uuid,uuid,integer,text,jsonb) from service_role;
create function public.project_document_mutate(p_actor uuid,p_project uuid,p_file uuid,p_revision integer,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.project_document_mutate_v56(p_actor,p_project,p_file,p_revision,p_action,p_data);
 if p_action<>'delete' then
  insert into public.project_document_history(document_id,revision,action,actor_id,actor_name,changed_at)
  select d.id,d.revision,p_action,p_actor,nullif(btrim(t.full_name),''),d.updated_at
  from public.project_documents d left join public.team_profiles t on t.user_id=p_actor
  where d.id=p_file and d.project_id=p_project;
 end if;
 return result;
end $$;

alter function public.project_documents_read(uuid,uuid,uuid) rename to project_documents_read_v56;
revoke all on function public.project_documents_read_v56(uuid,uuid,uuid) from service_role;
create function public.project_documents_read(p_actor uuid,p_project uuid,p_file uuid default null) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(item||jsonb_build_object('lastChangedBy',h.actor_name) order by ordinal),'[]'::jsonb)
 from jsonb_array_elements(public.project_documents_read_v56(p_actor,p_project,p_file)) with ordinality as entries(item,ordinal)
 left join public.project_document_history h on h.document_id=(item->>'id')::uuid and h.revision=(item->>'revision')::integer;
$$;

create function public.project_document_history_read(p_actor uuid,p_project uuid,p_file uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.project_documents_read_v55(p_actor,p_project,p_file);
 return coalesce((select jsonb_agg(jsonb_build_object('revision',revision,'action',action,'actorName',actor_name,'changedAt',changed_at) order by revision)
 from public.project_document_history where document_id=p_file),'[]'::jsonb);
end $$;

revoke all on function public.project_document_mutate(uuid,uuid,uuid,integer,text,jsonb), public.project_documents_read(uuid,uuid,uuid), public.project_document_history_read(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.project_document_mutate(uuid,uuid,uuid,integer,text,jsonb), public.project_documents_read(uuid,uuid,uuid), public.project_document_history_read(uuid,uuid,uuid) to service_role;
commit;
