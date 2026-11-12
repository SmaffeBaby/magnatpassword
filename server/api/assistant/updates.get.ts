export default defineEventHandler(async event => {
  const { client } = await requireSharedUser(event)
  const { data, error } = await client.from('assistant_updates').select('revision,posts').eq('id', true).single()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить историю обновлений.' })
  return data
})
