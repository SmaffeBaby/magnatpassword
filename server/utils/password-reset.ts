import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { RequestBudget } from '../../shared/utils/request-budget'
import type { EncryptedData } from '../../shared/types/vault'

const budget = new RequestBudget()
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))
const proofSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{22}$/)
}).strict()
const passwordSchema = z.string().refine(value =>
  [...value].length >= 12 && Buffer.byteLength(value, 'utf8') <= 72 && !value.includes('\0'))
const completeSchema = proofSchema.extend({ password: passwordSchema })
const codeHash = (code: string) => createHash('sha256').update(code).digest('hex')
const codeContext = (hash: string) => `password-reset:${hash}`

export async function requestPasswordReset(event: H3Event) {
  limitPasswordReset(event, 'request')
  const body = z.object({ email: emailSchema }).strict().safeParse(await readBody(event))
  if (!body.success) throw createError({ statusCode: 400, message: 'Укажите корректный email.' })
  const code = randomBytes(16).toString('base64url')
  const hash = codeHash(code)
  const { error } = await serverSupabase(event).rpc('password_reset_request', {
    p_email: body.data.email,
    p_code_hash: hash,
    p_sealed_code: sealSharedVault(code, sharedSecret(event), codeContext(hash), 1)
  })
  if (error) passwordResetUnavailable()
  return { ok: true }
}

export async function verifyPasswordReset(event: H3Event, complete = false) {
  limitPasswordReset(event, 'verify')
  const body = (complete ? completeSchema : proofSchema).safeParse(await readBody(event))
  if (!body.success) {
    throw createError({
      statusCode: 400,
      message: complete ? 'Проверьте код и длину нового пароля.' : 'Проверьте email и код сброса.'
    })
  }
  const { error, data } = await serverSupabase(event).rpc('password_reset_apply', {
    p_email: body.data.email,
    p_code_hash: codeHash(body.data.code),
    p_password: 'password' in body.data ? body.data.password : null
  })
  if (error) passwordResetUnavailable()
  if (!data) throw createError({ statusCode: 410, message: 'Код неверный, истёк или уже использован.' })
  return { ok: true }
}

export async function readPasswordResetInbox(event: H3Event) {
  const { client } = await requireSiteAdmin(event)
  const { data, error } = await client.rpc('password_reset_inbox')
  if (error) passwordResetUnavailable()
  const rows = data as { email: string; code_hash: string; sealed_code: EncryptedData; created_at: string; expires_at: string }[]
  const secret = sharedSecret(event)
  return rows.map(row => ({
    email: row.email,
    code: openSharedVault<string>(row.sealed_code, secret, codeContext(row.code_hash), 1),
    createdAt: row.created_at,
    expiresAt: row.expires_at
  }))
}

function limitPasswordReset(event: H3Event, action: 'request' | 'verify') {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const wait = budget.take(`password-reset:${action}:${getRequestIP(event) || 'unknown'}`, action === 'request' ? 30 : 60, 60_000)
  if (wait) {
    setHeader(event, 'Retry-After', Math.ceil(wait / 1_000))
    throw createError({ statusCode: 429, message: 'Слишком много попыток. Повторите через минуту.' })
  }
}

function passwordResetUnavailable(): never {
  throw createError({ statusCode: 503, message: 'Сброс пароля временно недоступен. Повторите позже.' })
}
