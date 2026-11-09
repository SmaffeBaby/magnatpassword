import { defaultHomeLayout } from '../../../shared/utils/home-layout'
import { homeLayoutSchema } from '../../utils/home-layout'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const { data, error } = await context.client.from('account_home_layouts').select('layout,revision').eq('user_id', context.user.id).maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить настройки главной страницы.' })
  if (!data) return { layout: defaultHomeLayout(), revision: 0 }
  const parsed = homeLayoutSchema.safeParse(data.layout)
  if (!parsed.success) throw createError({ statusCode: 503, message: 'Не удалось прочитать настройки главной страницы.' })
  return { layout: parsed.data, revision: data.revision }
})
