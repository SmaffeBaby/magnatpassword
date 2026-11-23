import { z } from 'zod'
import type { MeetingRoomBooking } from '../../../shared/types/meeting-room'
import { dayDifference } from '../../../shared/utils/subscriptions'
import { bookingColumns, bookingDate, meetingRoomTable, serializeMeetingRoomBookings } from '../../utils/meeting-room'

export default defineEventHandler(async (event): Promise<MeetingRoomBooking[]> => {
  const context = await requireSharedUser(event)
  const range = z.object({ from: bookingDate, to: bookingDate }).safeParse(getQuery(event))
  if (!range.success || range.data.from > range.data.to || dayDifference(range.data.from, range.data.to) > 61) {
    throw createError({ statusCode: 400, message: 'Выберите период до 62 дней.' })
  }
  const { from, to } = range.data
  const query = () => context.client.from(meetingRoomTable)
    .select(bookingColumns)
    .gte('booking_date', from).lte('booking_date', to)
    .order('booking_date').order('starts_at')
  const pageSize = 500
  const rows = []
  let cursor: { booking_date: string; starts_at: string } | undefined
  for (;;) {
    const page = query().limit(pageSize)
    if (cursor) {
      page.or(`booking_date.gt.${cursor.booking_date},and(booking_date.eq.${cursor.booking_date},starts_at.gt.${cursor.starts_at})`)
    }
    const { data, error } = await page
    if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить расписание.' })
    rows.push(...data)
    if (data.length < pageSize) break
    cursor = data.at(-1)
  }
  return serializeMeetingRoomBookings(context, rows)
})
