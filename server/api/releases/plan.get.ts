import { timingSafeEqual, createHash } from 'node:crypto'
import { readReleasePlan } from '../../utils/release-plan'
export default defineEventHandler(async event => {
  const expected = useRuntimeConfig(event).releasesBuildToken
  const supplied = getHeader(event, 'authorization')?.replace(/^Bearer /, '') || ''
  const digest = (value: string) => createHash('sha256').update(value).digest()
  if (!expected || !supplied || !timingSafeEqual(digest(expected), digest(supplied))) throw createError({ statusCode: 401 })
  const plan = await readReleasePlan(event)
  if (!plan) throw createError({ statusCode: 409, message: 'Сначала сохраните версию и изменения в админ-панели' })
  return { version: plan.version, notes: plan.notes }
})
