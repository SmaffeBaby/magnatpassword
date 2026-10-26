begin;
-- Keep only the deduplication marker after clearing a notification, so the
-- reminder generator cannot recreate a notification the account already deleted.
alter table public.app_notifications add column if not exists dismissed_at timestamptz;
create index if not exists app_notifications_visible_user_date
  on public.app_notifications(user_id,created_at desc) where dismissed_at is null;
notify pgrst, 'reload schema';
commit;
