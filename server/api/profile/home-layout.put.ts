import { z } from 'zod'
import { homeLayoutSchema } from '../../utils/home-layout'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const body = await sharedBody(event, z.object({ layout: homeLayoutSchema, revision: z.number().int().min(0).max(2147483646) }).strict())
  const value = { layout: body.layout, revision: body.revision + 1, updated_at: new Date().toISOString() }
  const table = context.client.from('account_home_layouts')
  const result = body.revision === 0
    ? await table.insert({ ...value, user_id: context.user.id }).select('revision').single()
    : await table.update(value).eq('user_id', context.user.id).eq('revision', body.revision).select('revision').maybeSingle()
  if (result.error?.code === '23505' || !result.error && !result.data) throw createError({ statusCode: 409, message: 'Настройки изменены на другом устройстве. Загрузите сохранённый вариант и повторите изменения.' })
  if (result.error) throw createError({ statusCode: 503, message: 'Не удалось сохранить настройки главной страницы.' })
  return { layout: body.layout, revision: result.data!.revision }
})
