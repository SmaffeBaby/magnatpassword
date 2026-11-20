begin;

create or replace function public.admin_module_storage()
returns jsonb language sql stable security definer set search_path = '' as $$
  with modules(id, relations) as (values
    ('kaban', array['kaban_boards','kaban_categories','kaban_events','kaban_files','kaban_gantt_markers',
      'kaban_live','kaban_task_locations','kaban_tasks']),
    ('passwords', array['project_passwords']),
    ('finances', array['finance_reports']),
    ('relationships', array[]::text[]),
    ('team', array['team_profiles','team_role_assignments','team_role_eligibility','team_units']),
    ('projects', array['projects','project_access','project_closing','project_closing_contracts',
      'project_companies','project_company_links','project_dashboard_preferences','project_document_cleanup',
      'project_document_folders','project_document_history','project_document_members','project_document_templates',
      'project_documents','project_estimates','project_execution','project_execution_contracts',
      'project_folders','project_inputs','project_members','project_preferences','project_roles']),
    ('contracts', array['project_contracts','project_contract_items','project_contract_files',
      'registry_contracts','registry_contract_files','registry_file_cleanup']),
    ('spaces', array['project_spaces','project_space_assets','project_space_cursors',
      'project_space_members','project_space_objects']),
    ('chat', array['project_chats','project_chat_files','project_chat_live','project_chat_members',
      'project_chat_message_files','project_chat_messages','project_chat_pins','project_chat_todos',
      'project_chat_votes','chat_task_links','chat_typing']),
    ('sharedVaults', array['vaults','shared_vaults','shared_vault_members','shared_cards','shared_card_vaults'])
  ),
  files as (
    select case bucket_id
      when 'kaban-files' then 'kaban'
      when 'vault-files' then 'sharedVaults'
      when 'profile-avatars' then 'team'
      when 'project-contracts' then 'contracts'
      when 'contract-register' then 'contracts'
      when 'project-inputs' then 'projects'
      when 'project-documents' then case split_part(name, '/', 1)
        when 'chat' then 'chat'
        when 'spaces' then 'spaces'
        else 'projects'
      end
    end as module_id, (metadata->>'size')::numeric as bytes
    from storage.objects
    where bucket_id in ('kaban-files','vault-files','profile-avatars','project-contracts',
      'contract-register','project-inputs','project-documents')
      and metadata->>'size' ~ '^[0-9]+$'
  ),
  file_sizes as (select module_id, sum(bytes) as bytes from files group by module_id)
  select jsonb_object_agg(modules.id, jsonb_build_object(
    'databaseBytes', coalesce((
      select sum(pg_total_relation_size(('public.' || relation)::regclass))
      from unnest(modules.relations) as names(relation)
    ), 0),
    'fileBytes', coalesce(file_sizes.bytes, 0)
  ))
  from modules left join file_sizes on file_sizes.module_id = modules.id;
$$;

revoke all on function public.admin_module_storage() from public, anon, authenticated;
grant execute on function public.admin_module_storage() to service_role;
notify pgrst, 'reload schema';
commit;
