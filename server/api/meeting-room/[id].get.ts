import { bookingColumns, meetingRoomBookingId, meetingRoomTable, serializeMeetingRoomBookings } from '../../utils/meeting-room'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const id = meetingRoomBookingId(event)
  const { data, error } = await context.client.from(meetingRoomTable).select(bookingColumns).eq('id', id).maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить бронь.' })
  if (!data) throw createError({ statusCode: 404, message: 'Бронь не найдена.' })
  return (await serializeMeetingRoomBookings(context, [data]))[0]!
})
