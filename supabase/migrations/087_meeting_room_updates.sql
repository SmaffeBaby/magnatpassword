begin;

alter table public.meeting_room_bookings
  add column revision integer not null default 1 check (revision > 0);
grant update on public.meeting_room_bookings to service_role;

alter table public.app_notifications drop constraint app_notifications_kind_check;
alter table public.app_notifications add constraint app_notifications_kind_check
  check (kind in ('shared', 'subscription', 'kaban', 'project-chat', 'meeting-room'));
alter table public.app_notifications add column meeting_booking_id uuid;

create function public.notify_meeting_room_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  previous_ids uuid[] := '{}';
  next_ids uuid[] := '{}';
  booking public.meeting_room_bookings;
begin
  if tg_op = 'UPDATE' then
    if (new.booking_date, new.starts_at, new.ends_at, new.title, new.notes, new.participant_ids, new.attachment_name, new.attachment)
       is not distinct from
       (old.booking_date, old.starts_at, old.ends_at, old.title, old.notes, old.participant_ids, old.attachment_name, old.attachment) then
      return null;
    end if;
  end if;
  if tg_op <> 'INSERT' then previous_ids := old.participant_ids; end if;
  if tg_op = 'DELETE' then
    booking := old;
  else
    booking := new;
    next_ids := new.participant_ids;
  end if;

  insert into public.app_notifications (user_id, kind, dedupe_key, title, message, meeting_booking_id)
  select u.id, 'meeting-room',
    'meeting-room/' || booking.id || '/' || booking.revision || '/' || tg_op,
    case
      when tg_op = 'DELETE' then 'Бронь отменена'
      when not (u.id = any(next_ids)) then 'Вас убрали из брони'
      when not (u.id = any(previous_ids)) then 'Вас пригласили в переговорную'
      else 'Бронь обновлена'
    end,
    booking.title || ' · ' || to_char(booking.booking_date, 'DD.MM.YYYY')
      || ', ' || left(booking.starts_at::text, 5) || '–' || left(booking.ends_at::text, 5) || ' МСК',
    case when u.id = any(next_ids) then booking.id end
  from auth.users u
  left join public.notification_preferences p on p.user_id = u.id
  where u.id = any(previous_ids || next_ids)
    and u.id is distinct from booking.creator_id
    and u.deleted_at is null
    and coalesce(p.settings->'meetingRoom', 'true'::jsonb) = 'true'::jsonb
  on conflict (user_id, dedupe_key) do nothing;
  return null;
end
$$;

revoke all on function public.notify_meeting_room_booking() from public, anon, authenticated;
create trigger meeting_room_notifications
after insert or update or delete on public.meeting_room_bookings
for each row execute function public.notify_meeting_room_booking();

notify pgrst, 'reload schema';
commit;
