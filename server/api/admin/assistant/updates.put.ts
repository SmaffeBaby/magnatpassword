import { z } from 'zod'
export default defineEventHandler(async event => {
  const { client } = await requireSiteAdmin(event)
  const body = await sharedBody(event, z.object({ revision: z.number().int().positive(), posts: z.array(z.object({ id: z.uuid(), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000), date: z.iso.date(), kind: z.enum(['feature', 'fix']) }).strict()).max(500).refine(posts => new Set(posts.map(post => post.id)).size === posts.length) }).strict())
  const { data, error } = await client.from('assistant_updates').update({ posts: body.posts, revision: body.revision + 1 }).eq('id', true).eq('revision', body.revision).select('revision,posts').maybeSingle()
  if (error) throw createError({ statusCode: 503, message: 'Не удалось сохранить обновления.' })
  if (!data) throw createError({ statusCode: 409, message: 'История изменилась. Обновите список перед сохранением.' })
  return data
})
