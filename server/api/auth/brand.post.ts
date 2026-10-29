import { z } from 'zod'
import { brandForEmail } from '../../../shared/utils/branding'

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  const body = z.object({ email: z.email().max(254) }).strict().safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, message: 'Некорректный email' })
  const email = body.data.email.trim().toLowerCase()
  const { data, error } = await serverSupabase(event).rpc('login_brand', { p_email: email })
  if (error) throw createError({ statusCode: 503, message: 'Не удалось определить оформление' })
  // The response contains presentation only, with the same shape for unknown addresses.
  return { brand: data === 'light' || data === 'magnat' ? data : brandForEmail(email) }
})
