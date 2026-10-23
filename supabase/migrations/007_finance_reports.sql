begin;
create table if not exists public.finance_reports (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  encrypted_summary jsonb not null check (jsonb_typeof(encrypted_summary) = 'object'),
  encrypted_pdf jsonb not null check (jsonb_typeof(encrypted_pdf) = 'object')
);
create index if not exists finance_reports_user_date on public.finance_reports(user_id, created_at desc, id desc);
alter table public.finance_reports enable row level security;
revoke all on public.finance_reports from public, anon, authenticated;
grant all on public.finance_reports to service_role;
notify pgrst, 'reload schema';
commit;
