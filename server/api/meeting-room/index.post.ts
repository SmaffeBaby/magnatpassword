import { meetingRoomTable, meetingRoomWriteError, readMeetingRoomForm } from '../../utils/meeting-room'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const { values } = await readMeetingRoomForm(event, context)
  const { data, error } = await context.client.from(meetingRoomTable)
    .insert({ ...values, creator_id: context.user.id }).select('id').single()
  if (error) meetingRoomWriteError(error, 'Не удалось создать бронь.')
  setResponseStatus(event, 201)
  return { id: data.id }
})
