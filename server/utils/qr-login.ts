import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { RequestBudget } from '../../shared/utils/request-budget'
import { describeDevice } from '../../shared/utils/account-device'
import { qrLoginLifetimeMs, qrSecretPattern } from '../../shared/utils/qr-login'

const budget = new RequestBudget()
export const qrSecretSchema = z.string().regex(qrSecretPattern)
export const qrBrowserSchema = z.object({ id: z.uuid(), secret: qrSecretSchema }).strict()
export const qrScanSchema = z.object({ token: qrSecretSchema }).strict()
export const qrHash = (secret: string) => createHash('sha256').update(secret).digest('hex')

export function qrLimit(event: H3Event, action: 'create' | 'poll' | 'scan') {
  setHeader(event, 'Cache-Control', 'private, no-store')
  const wait = budget.take(`qr:${action}:${getRequestIP(event) || 'unknown'}`, action === 'create' ? 20 : action === 'poll' ? 600 : 120, 60000)
  if (wait) {
    setHeader(event, 'Retry-After', Math.ceil(wait / 1000))
    throw createError({ statusCode: 429, message: 'Слишком много запросов. Повторите через минуту.' })
  }
}

export function newQrRequest(userAgent: string) {
  const token = randomBytes(32).toString('hex'), secret = randomBytes(32).toString('hex')
  const device = describeDevice(userAgent)
  const row = { id: randomUUID(), scan_hash: qrHash(token), browser_hash: qrHash(secret),
    verification_code: String(randomInt(100000, 1000000)), device_label: `${device.browser} · ${device.platform}`,
    expires_at: new Date(Date.now() + qrLoginLifetimeMs).toISOString() }
  return { row, token, secret }
}

export function qrUnavailable(): never {
  throw createError({ statusCode: 410, message: 'QR-код истёк или уже использован. Обновите его на компьютере.' })
}
