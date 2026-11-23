begin;

create table public.meeting_room_bookings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users(id) on delete set null,
  booking_date date not null,
  starts_at time not null,
  ends_at time not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text not null default '' check (char_length(notes) <= 4000),
  participant_ids uuid[] not null default '{}' check (cardinality(participant_ids) <= 25),
  attachment_name text,
  attachment bytea,
  check (starts_at >= time '10:00' and ends_at <= time '19:00' and starts_at < ends_at),
  check (extract(second from starts_at) = 0 and extract(second from ends_at) = 0),
  check (
    (attachment_name is null and attachment is null) or
    (attachment_name is not null and char_length(attachment_name) between 1 and 240
      and attachment is not null and octet_length(attachment) between 1 and 10485760)
  ),
  -- Adjacent bookings are allowed. PostgreSQL rejects overlapping inserts even under concurrency.
  exclude using gist (tsrange(booking_date + starts_at, booking_date + ends_at, '[)') with &&)
);

create index on public.meeting_room_bookings (booking_date, starts_at);
create index on public.meeting_room_bookings (creator_id);
alter table public.meeting_room_bookings enable row level security;
revoke all on public.meeting_room_bookings from public, anon, authenticated;
grant select, insert, delete on public.meeting_room_bookings to service_role;

update public.account_home_layouts
set layout = jsonb_set(layout, '{rows}', (layout->'rows') ||
    jsonb_build_array(jsonb_build_object('align', 'center', 'cards', jsonb_build_array('meeting-room')))),
    revision = revision + 1,
    updated_at = now()
where not (layout->'hidden') ? 'meeting-room'
  and not exists (
    select 1 from jsonb_array_elements(layout->'rows') as row
    where (row->'cards') ? 'meeting-room'
  );

notify pgrst, 'reload schema';
commit;
