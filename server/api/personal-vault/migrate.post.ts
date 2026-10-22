import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const body = await sharedBody(event, z.object({ password: z.string().min(1).max(1024) }).strict())
  const row = await personalRow(context)
  if (!row || row.encryption_mode !== 'client') throw createError({ statusCode: 409, statusMessage: 'Already migrated', message: 'Обновите страницу: перенос уже выполнен.' })
  let plain
  try { plain = await decryptLegacyPersonal(row, body.password) }
  catch { throw createError({ statusCode: 400, statusMessage: 'Invalid master password', message: 'Неверный прежний мастер-пароль или повреждённое хранилище' }) }
  const { data, error } = await context.client.from('vaults').update({ encrypted_data: sealPersonal(event, plain, context.user.id), encryption_mode: 'server', revision: row.revision + 1, updated_at: new Date().toISOString() }).eq('user_id', context.user.id).eq('encryption_mode', 'client').eq('revision', row.revision).select('revision').maybeSingle()
  if (error || !data) throw createError({ statusCode: 409, statusMessage: 'Migration conflict', message: 'Не удалось завершить перенос. Обновите страницу и повторите.' })
  return { migrationRequired: false as const, data: plain, revision: data.revision }
})
