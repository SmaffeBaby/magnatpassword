import { meetingRoomBookingId, meetingRoomTable } from '../../utils/meeting-room'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const id = meetingRoomBookingId(event)
  const { data, error } = await context.client.from(meetingRoomTable).delete()
    .eq('id', id).eq('creator_id', context.user.id).select('id').maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось удалить бронь.' })
  if (!data) throw createError({ statusCode: 404, message: 'Бронь отсутствует или вы не её автор.' })
  return { id: data.id }
})
