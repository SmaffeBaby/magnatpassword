begin;
create table public.project_space_assets(id uuid primary key,space_id uuid not null references public.project_spaces(id) on delete cascade,path text not null unique,encrypted_data jsonb not null,created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now());
alter table public.project_space_assets enable row level security;
revoke all on public.project_space_assets from public,anon,authenticated;
grant all on public.project_space_assets to service_role;
create function public.space_asset_cleanup() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.project_document_cleanup(path) values(old.path) on conflict do nothing;return old;end $$;
create trigger space_asset_cleanup after delete on public.project_space_assets for each row execute function public.space_asset_cleanup();
commit;
