import { meetingRoomBookingId, meetingRoomTable, meetingRoomWriteError, readMeetingRoomForm } from '../../utils/meeting-room'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const id = meetingRoomBookingId(event)
  const ownBooking = () => context.client.from(meetingRoomTable)
  const { data: current, error: readError } = await ownBooking().select('revision,participant_ids')
    .eq('id', id).eq('creator_id', context.user.id).maybeSingle()
  if (readError) meetingRoomWriteError(readError, 'Не удалось загрузить бронь.')
  if (!current) throw createError({ statusCode: 404, message: 'Бронь отсутствует или вы не её автор.' })
  const { revision, values } = await readMeetingRoomForm(event, context, current.participant_ids)
  if (!revision) throw createError({ statusCode: 400, message: 'Обновите данные брони.' })
  const { data, error } = await ownBooking().update({ ...values, revision: revision + 1 })
    .eq('id', id).eq('creator_id', context.user.id).eq('revision', revision).select('id').maybeSingle()
  if (error) meetingRoomWriteError(error, 'Не удалось сохранить бронь.')
  if (!data) throw createError({ statusCode: 409, message: 'Бронь уже изменилась. Откройте её заново.' })
  return { id: data.id }
})
