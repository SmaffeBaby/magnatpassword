begin;
alter table public.vaults add column if not exists encryption_mode text not null default 'client' check (encryption_mode in ('client','server'));
-- Legacy browser clients may read their encrypted backup but cannot overwrite migrated data.
revoke insert, update on public.vaults from authenticated;
notify pgrst, 'reload schema';
commit;
