import { z } from 'zod'
export default defineEventHandler(async event => {
  await requireSharedUser(event)
  const kind = z.enum(['wordcraft','pdfcraft','gridcraft','deckcraft','photocraft']).safeParse(getQuery(event).kind)
  if (!kind.success) throw createError({ statusCode: 400, message: 'Выберите редактор' })
  setHeaders(event, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, no-store' })
  return projectDocumentTemplate(kind.data)
})
