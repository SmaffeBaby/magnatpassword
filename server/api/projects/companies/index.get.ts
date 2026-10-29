import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event)
  const parsed = z.uuid().optional().safeParse(getQuery(event).projectId)
  if (!parsed.success) throw createError({statusCode:400,message:'Некорректный проект'})
  return listProjectCompanies(event,context,parsed.data)
})
