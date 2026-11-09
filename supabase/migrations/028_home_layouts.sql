begin;
create table public.account_home_layouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  layout jsonb not null check (jsonb_typeof(layout) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.account_home_layouts enable row level security;
revoke all on public.account_home_layouts from public, anon, authenticated;
grant all on public.account_home_layouts to service_role;
notify pgrst, 'reload schema';
commit;
