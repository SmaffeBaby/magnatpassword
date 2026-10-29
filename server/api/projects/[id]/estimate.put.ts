import { estimateWriteSchema } from '../../../../shared/utils/estimate'
export default defineEventHandler(async event => {
  await requireProjectsUser(event)
  const body = await sharedBody(event, estimateWriteSchema)
  if (JSON.stringify(body).length > 12_000_000) throw createError({ statusCode: 413, message: 'Смета слишком большая. Уменьшите изображения.' })
  const { projectName, ...estimate } = await projectEstimate(event, body)
  return estimate
})
