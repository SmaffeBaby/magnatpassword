import { meetingRoomBookingId, meetingRoomTable } from '../../../utils/meeting-room'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const id = meetingRoomBookingId(event)
  const { data, error } = await context.client.from(meetingRoomTable)
    .select('attachment_name,attachment').eq('id', id).maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить файл.' })
  if (!data?.attachment_name || !data.attachment) throw createError({ statusCode: 404, message: 'Файл не найден.' })
  setHeader(event, 'Content-Type', 'application/octet-stream')
  setHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(data.attachment_name).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16))}`)
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return Buffer.from(data.attachment.slice(2), 'hex')
})
