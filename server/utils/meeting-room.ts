import { z } from 'zod'
import type { H3Event } from 'h3'
import type { MeetingRoomBooking, MeetingRoomPerson, MeetingRoomReference } from '../../shared/types/meeting-room'
import { meetingRoomFileLimit, meetingRoomParticipantLimit, validMeetingRoomTime } from '../../shared/utils/meeting-room'
import { validDate } from '../../shared/utils/subscriptions'
import { teamAvatarUrls } from './team'

export const meetingRoomTable = 'meeting_room_bookings'
export const bookingColumns = 'id,creator_id,booking_date,starts_at,ends_at,title,notes,participant_ids,attachment_name,revision'
type BookingRow = {
  id: string; creator_id: string | null; booking_date: string; starts_at: string; ends_at: string;
  title: string; notes: string; participant_ids: string[]; attachment_name: string | null; revision: number
}
type Context = Awaited<ReturnType<typeof requireSharedUser>>
export const bookingDate = z.string().refine(validDate)
export async function readMeetingRoomReferences(context: Context, ids: string[]) {
  const found = new Map<string, MeetingRoomReference>()
  const unique = [...new Set(ids)]
  for (let offset = 0; offset < unique.length; offset += 100) {
    const { data, error } = await context.client.from(meetingRoomTable).select('id,title,booking_date,starts_at,ends_at')
      .in('id', unique.slice(offset, offset + 100))
    if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить брони переговорной.' })
    for (const row of data) found.set(row.id, { id: row.id, title: row.title, date: row.booking_date, start: row.starts_at.slice(0, 5), end: row.ends_at.slice(0, 5) })
  }
  return found
}
const bookingInput = z.object({
  date: bookingDate,
  start: z.string(),
  end: z.string(),
  title: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(4000),
  participantIds: z.array(z.uuid()).max(meetingRoomParticipantLimit).transform(ids => [...new Set(ids)]),
  revision: z.number().int().min(1).max(2147483646).optional(),
  removeAttachment: z.boolean().optional()
}).strict()

export function meetingRoomBookingId(event: H3Event) {
  const parsed = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Некорректный номер брони.' })
  return parsed.data
}

async function meetingRoomPeople(context: Context, ids: string[], withAvatars = false) {
  const people = new Map<string, MeetingRoomPerson>()
  const unique = [...new Set(ids)]
  const rows = []
  for (let offset = 0; offset < unique.length; offset += 100) {
    const { data, error } = await context.client.from('team_profiles')
      .select('user_id,full_name,account_email,avatar_path')
      .or(`is_hidden.eq.false,user_id.eq.${context.user.id}`).in('user_id', unique.slice(offset, offset + 100))
    if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить участников.' })
    rows.push(...data)
  }
  const urls = withAvatars ? await teamAvatarUrls(context, rows.flatMap(row => row.avatar_path ? [row.avatar_path] : [])) : undefined
  for (const row of rows) people.set(row.user_id, { id: row.user_id, name: row.full_name || row.account_email, avatarUrl: urls?.get(row.avatar_path) })
  return people
}

export async function serializeMeetingRoomBookings(context: Context, rows: BookingRow[]): Promise<MeetingRoomBooking[]> {
  const people = await meetingRoomPeople(context, rows.flatMap(row => [
    ...(row.creator_id ? [row.creator_id] : []), ...row.participant_ids
  ]), true)
  return rows.map(row => ({
    id: row.id,
    date: row.booking_date,
    start: row.starts_at.slice(0, 5),
    end: row.ends_at.slice(0, 5),
    title: row.title,
    notes: row.notes,
    organizer: row.creator_id ? people.get(row.creator_id) ?? null : null,
    participants: row.participant_ids.flatMap(id => people.get(id) ?? []),
    attachmentName: row.attachment_name,
    canDelete: row.creator_id === context.user.id,
    canEdit: row.creator_id === context.user.id,
    revision: row.revision
  }))
}

export async function readMeetingRoomForm(event: H3Event, context: Context, previousIds: string[] = []) {
  const parts = await readMultipartFormData(event)
  const payload = parts?.find(part => part.name === 'booking' && !part.filename)
  const file = parts?.find(part => part.name === 'file')
  let input: unknown
  try { input = JSON.parse(payload?.data.toString('utf8') ?? '') }
  catch { throw createError({ statusCode: 400, message: 'Некорректные данные брони.' }) }
  const parsed = bookingInput.safeParse(input)
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Проверьте тему, дату и участников брони.' })
  const booking = parsed.data
  if (!validMeetingRoomTime(booking.start, booking.end)) {
    throw createError({ statusCode: 400, message: 'Укажите время начала и окончания в пределах 10:00–19:00.' })
  }
  if (file && (!file.filename || !file.data.length)) {
    throw createError({ statusCode: 400, message: 'Выберите непустой файл.' })
  }
  if (file && file.data.length > meetingRoomFileLimit) {
    throw createError({ statusCode: 413, message: 'Максимальный размер файла — 10 МБ.' })
  }
  const people = await meetingRoomPeople(context, [...booking.participantIds, ...previousIds])
  if (booking.participantIds.some(id => !people.has(id))) {
    throw createError({ statusCode: 400, message: 'Кто-то из участников недоступен. Проверьте список.' })
  }
  // Keep participants who are no longer visible in the directory.
  const ids = [...new Set([...booking.participantIds, ...previousIds.filter(id => !people.has(id))])]
  if (ids.length > meetingRoomParticipantLimit) {
    throw createError({ statusCode: 400, message: 'К брони можно добавить до 25 участников.' })
  }
  const attachment = file?.filename
    ? { attachment_name: file.filename.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 240).toWellFormed(), attachment: '\\x' + file.data.toString('hex') }
    : booking.removeAttachment ? { attachment_name: null, attachment: null } : {}
  return {
    revision: booking.revision,
    values: {
      booking_date: booking.date, starts_at: booking.start, ends_at: booking.end,
      title: booking.title, notes: booking.notes, participant_ids: ids, ...attachment
    }
  }
}

export function meetingRoomWriteError(error: { code?: string }, message: string): never {
  if (error.code === '23P01') throw createError({ statusCode: 409, message: 'Переговорная уже занята в это время.' })
  throw createError({ statusCode: 503, message })
}
