begin;
create table if not exists public.app_release_plan (
  id boolean primary key default true check (id),
  version text not null check (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  notes text not null check (length(trim(notes)) between 1 and 30000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.app_release_plan enable row level security;
revoke all on public.app_release_plan from anon, authenticated;
grant all on public.app_release_plan to service_role;
notify pgrst, 'reload schema';
commit;
