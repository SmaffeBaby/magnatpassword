begin;
create table if not exists public.vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  salt text not null check (length(salt) between 20 and 128),
  encrypted_data jsonb not null check (jsonb_typeof(encrypted_data) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.vaults enable row level security;
alter table public.site_admins enable row level security;
drop policy if exists vault_owner on public.vaults;
create policy vault_owner on public.vaults for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists admin_self on public.site_admins;
create policy admin_self on public.site_admins for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.vaults, public.site_admins from anon, authenticated;
grant select, insert, update on public.vaults to authenticated;
grant select on public.site_admins to authenticated;
grant all on public.vaults, public.site_admins to service_role;
-- Reserved for future encrypted attachments. No public objects or broad admin access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vault-files', 'vault-files', false, 10485760, array['application/octet-stream']) on conflict (id) do nothing;
drop policy if exists vault_files_owner on storage.objects;
create policy vault_files_owner on storage.objects for all to authenticated
using (bucket_id = 'vault-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'vault-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
notify pgrst, 'reload schema';
commit;
