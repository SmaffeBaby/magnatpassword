begin;
create table public.project_document_templates (
 id uuid primary key,owner_id uuid not null references public.team_profiles(user_id) on delete cascade,
 stage text not null check(stage in ('execution','closing')),kind text not null,
 encrypted_summary jsonb not null,encrypted_data jsonb not null,revision integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((stage='execution' and kind in ('contract','appendix','invoice')) or (stage='closing' and kind in ('act','upd')))
);
create index project_document_templates_stage on public.project_document_templates(stage,updated_at desc);
alter table public.project_document_templates enable row level security;
revoke all on public.project_document_templates from public,anon,authenticated;
grant all on public.project_document_templates to service_role;
create function public.project_document_template_list(p_actor uuid,p_stage text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.project_access where user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'ownerId',t.owner_id,'author',coalesce(nullif(p.full_name,''),'Участник проекта'),'stage',t.stage,'kind',t.kind,'revision',t.revision,'updatedAt',t.updated_at,'canEdit',t.owner_id=p_actor,'summary',t.encrypted_summary) order by t.updated_at desc,t.id) from public.project_document_templates t join public.team_profiles p on p.user_id=t.owner_id where t.stage=p_stage),'[]'::jsonb);
end $$;
create function public.project_document_template_read(p_actor uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.project_access where user_id=p_actor) then raise exception 'ACCESS_DENIED'; end if;
 select jsonb_build_object('id',t.id,'ownerId',t.owner_id,'author',coalesce(nullif(p.full_name,''),'Участник проекта'),'stage',t.stage,'kind',t.kind,'revision',t.revision,'updatedAt',t.updated_at,'canEdit',t.owner_id=p_actor,'summary',t.encrypted_summary,'data',t.encrypted_data) into result from public.project_document_templates t join public.team_profiles p on p.user_id=t.owner_id where t.id=p_id;
 if result is null then raise exception 'TEMPLATE_NOT_FOUND'; end if;
 return result;
end $$;
create function public.project_document_template_write(p_actor uuid,p_id uuid,p_revision integer,p_stage text,p_kind text,p_summary jsonb,p_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare existing public.project_document_templates%rowtype;
begin
 perform 1 from public.project_access where user_id=p_actor for share;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 if p_revision=0 then
  insert into public.project_document_templates(id,owner_id,stage,kind,encrypted_summary,encrypted_data) values(p_id,p_actor,p_stage,p_kind,p_summary,p_data);
 else
  select * into existing from public.project_document_templates where id=p_id for update;
  if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
  if existing.owner_id<>p_actor then raise exception 'TEMPLATE_AUTHOR_REQUIRED'; end if;
  if existing.revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
  if existing.stage<>p_stage or existing.kind<>p_kind then raise exception 'TEMPLATE_KIND_FIXED'; end if;
  update public.project_document_templates set encrypted_summary=p_summary,encrypted_data=p_data,revision=revision+1,updated_at=now() where id=p_id;
 end if;
end $$;
revoke all on function public.project_document_template_list(uuid,text),public.project_document_template_read(uuid,uuid),public.project_document_template_write(uuid,uuid,integer,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.project_document_template_list(uuid,text),public.project_document_template_read(uuid,uuid),public.project_document_template_write(uuid,uuid,integer,text,text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
