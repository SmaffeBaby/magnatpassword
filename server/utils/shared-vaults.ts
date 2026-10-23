import {sanitizeSvg,validRasterImage} from '../../shared/utils/media'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { validDate } from '../../shared/utils/subscriptions'
import { withoutDefaultCategories } from '../../shared/utils/vault-data'
import { openSharedVault } from './shared-crypto'
import type { VaultData } from '../../shared/types/vault'
export const subscriptionDateSchema = z.string().refine(validDate, 'Invalid date')
export const reminderRulesSchema = z.object({ leadDays: z.array(z.number().int().min(0).max(3650)).max(12), repeatEveryDays: z.number().int().min(0).max(365), customDates: z.array(subscriptionDateSchema).max(12) }).strict()
export const notificationSettingsSchema = reminderRulesSchema.extend({ sharedChanges: z.boolean(), subscriptions: z.boolean() }).strict()
const subscriptionSchema = z.object({ price: z.number().finite().min(0).max(1_000_000_000), currency: z.enum(['USD','EUR','RUB','CNY']), periodCount: z.number().int().min(1).max(1000), periodUnit: z.enum(['day','month','year']), startsOn: subscriptionDateSchema, paidFrom: subscriptionDateSchema.optional(), paidUntil: subscriptionDateSchema, autoRenew: z.boolean(), reminders: reminderRulesSchema.optional() }).strict().refine(s => s.paidUntil >= s.startsOn && (!s.paidFrom || s.paidFrom <= s.paidUntil), 'Invalid subscription period')
export const paymentSchema = z.object({id:z.uuid(),entryId:z.uuid(),fieldId:z.uuid(),service:z.string().min(1).max(120),label:z.string().min(1).max(60),amount:z.number().finite().min(0).max(1_000_000_000),currency:z.enum(['USD','EUR','RUB','CNY']),paidAt:z.iso.datetime(),periodFrom:subscriptionDateSchema,periodUntil:subscriptionDateSchema}).strict().refine(p=>p.periodUntil>p.periodFrom,'Invalid payment period')
export const credentialSchema = z.object({
  id:z.uuid(), title:z.string().trim().min(1).max(120),url:z.string().max(2000),username:z.string().max(300),password:z.string().max(1024),notes:z.string().max(10000),categoryId:z.string().max(128),categoryIds:z.array(z.string().min(1).max(128)).max(50).optional(),favorite:z.boolean(),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),
  accounts:z.array(z.object({id:z.uuid(),label:z.string().trim().min(1).max(80),username:z.string().max(300),password:z.string().max(1024)}).strict()).max(30).optional(),
  images:z.array(z.object({id:z.uuid(),name:z.string().min(1).max(160),data:z.string().max(360000).refine(validRasterImage,'Invalid image')}).strict()).max(5).optional(),
  customFields:z.array(z.object({id:z.uuid(),label:z.string().trim().min(1).max(60),value:z.string().max(4000),type:z.enum(['text','secret','url','subscription']),subscription:subscriptionSchema.optional()}).strict().refine(f=>f.type!=='subscription'||!!f.subscription,'Subscription details required')).max(24).optional(),
  links:z.array(z.object({id:z.uuid(),targetVaultId:z.union([z.literal('personal'),z.uuid()]),targetEntryId:z.uuid(),sourceFieldId:z.union([z.enum(['card','title','url','username','password','notes']),z.uuid()]).optional(),targetFieldId:z.union([z.enum(['card','title','url','username','password','notes']),z.uuid()]).optional(),label:z.string().max(100).optional()}).strict()).max(50).optional()
}).strict()
export const svgSchema=z.string().max(65000).transform(value=>sanitizeSvg(value)).refine(Boolean,'Invalid SVG')
export const sharedDataSchema = z.object({
 version:z.literal(1),name:z.string().trim().min(1).max(80).optional(),svg:svgSchema.optional(),
 subscriptionPayments:z.array(paymentSchema).max(20000).optional(),
 categories:z.array(z.object({id:z.string().min(1).max(128),name:z.string().trim().min(1).max(60),icon:z.string().regex(/^i-lucide-[a-z0-9-]+$/),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),svg:svgSchema.optional()}).strict()).max(500),
 entries:z.array(credentialSchema).max(5000)
}).strict()
export const revisionSchema = z.number().int().positive()
export async function sharedBody<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Shared vault request failed', message: 'Некорректные данные запроса' })
  return parsed.data
}
export async function requireSharedUser(event: H3Event) {
  const token = getHeader(event, 'authorization')?.match(/^Bearer (\S+)$/i)?.[1]
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Shared vault request failed', message: 'Войдите в аккаунт' })
  const client = serverSupabase(event)
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw createError({ statusCode: 401, statusMessage: 'Shared vault request failed', message: 'Сессия завершена. Войдите снова.' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  return { client, user: data.user }
}
export function sharedId(event: H3Event) {
  const parsed = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Shared vault request failed', message: 'Некорректное хранилище' })
  return parsed.data
}
export async function requireSharedMember(event: H3Event) {
  const context = await requireSharedUser(event), id = sharedId(event)
  const { data: membership, error } = await context.client.from('shared_vault_members').select('user_id').eq('vault_id', id).eq('user_id', context.user.id).maybeSingle()
  if (error) throw createError({ statusCode: 503, statusMessage: 'Shared vault request failed', message: 'Не удалось проверить доступ' })
  if (!membership) throw createError({ statusCode: 403, statusMessage: 'Shared vault request failed', message: 'Нет доступа к хранилищу' })
  const { data: row, error: failure } = await context.client.from('shared_vaults').select('*').eq('id', id).single()
  if (failure) throw createError({ statusCode: 503, statusMessage: 'Shared vault request failed', message: 'Не удалось загрузить хранилище' })
  return { ...context, id, row }
}
export function sharedSecret(event: H3Event): string {
  const secret = useRuntimeConfig(event).sharedVaultKey
  if (!secret || Buffer.from(secret, 'base64').length !== 32) throw createError({ statusCode: 503, statusMessage: 'Shared vault request failed', message: 'Серверное хранилище ещё не настроено' })
  return secret
}
export function decodeShared(event: H3Event, row: { encrypted_data: any; id: string; key_epoch: number }): VaultData {
  try { return withoutDefaultCategories(sharedDataSchema.parse(openSharedVault(row.encrypted_data, sharedSecret(event), row.id, row.key_epoch))) }
  catch { throw createError({ statusCode: 503, statusMessage: 'Shared vault request failed', message: 'Не удалось расшифровать общее хранилище' }) }
}
export async function mutateShared(context: Awaited<ReturnType<typeof requireSharedUser>>, action: string, id: string, revision: number, payload: Record<string, unknown>) {
  const { error } = await context.client.rpc('shared_vault_mutate', { p_actor: context.user.id, p_action: action, p_id: id, p_revision: revision, p_payload: payload })
  if (!error) return { ok: true }
  const errors: Record<string, [number, string]> = {
    ACCESS_DENIED: [403, 'Нет доступа к хранилищу'],
    REVISION_CONFLICT: [409, 'Хранилище изменилось. Обновите данные и повторите действие.'],
    USER_NOT_FOUND: [404, 'Пользователь с таким email не зарегистрирован'],
    ALREADY_MEMBER: [409, 'Пользователь уже имеет доступ'],
    OWNER_REQUIRED: [400, 'Нельзя удалить владельца хранилища']
  }
  const mapped = Object.entries(errors).find(([code]) => error.message.includes(code))?.[1]
  throw createError({ statusCode: mapped?.[0] ?? 503, statusMessage: 'Shared vault request failed', message: mapped?.[1] ?? 'Не удалось сохранить общее хранилище' })
}
