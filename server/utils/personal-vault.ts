import { pbkdf2, createDecipheriv, randomBytes } from 'node:crypto'
import { withoutDefaultCategories } from '../../shared/utils/vault-data'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import type { VaultData } from '../../shared/types/vault'
import { openSharedVault, sealSharedVault } from './shared-crypto'
import { sharedDataSchema, sharedSecret } from './shared-vaults'
export function sealPersonal(event: H3Event, data: VaultData, userId: string) {
  return sealSharedVault(data, sharedSecret(event), `personal:${userId}`, 1)
}
export function openPersonal(event: H3Event, row: any): VaultData {
  try { return withoutDefaultCategories(sharedDataSchema.parse(openSharedVault(row.encrypted_data, sharedSecret(event), `personal:${row.user_id}`, 1))) }
  catch { throw createError({ statusCode: 503, statusMessage: 'Personal vault unavailable', message: 'Не удалось открыть личное хранилище' }) }
}
export async function personalRow(context: Awaited<ReturnType<typeof requireSharedUser>>) {
  const { data, error } = await context.client.from('vaults').select('*').eq('user_id', context.user.id).maybeSingle()
  if (error) throw createError({ statusCode: 503, statusMessage: 'Personal vault unavailable', message: 'Не удалось загрузить личное хранилище' })
  return data
}
export async function decryptLegacyPersonal(row: { salt: string; encrypted_data: { iv: string; ciphertext: string }; user_id: string }, password: string): Promise<VaultData> {
  const key = await promisify(pbkdf2)(password, Buffer.from(row.salt, 'base64'), 600_000, 32, 'sha256')
  const ciphertext = Buffer.from(row.encrypted_data.ciphertext, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.encrypted_data.iv, 'base64'))
  decipher.setAAD(Buffer.from(row.user_id)); decipher.setAuthTag(ciphertext.subarray(-16))
  return withoutDefaultCategories(sharedDataSchema.parse(JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(0,-16)), decipher.final()]).toString('utf8'))))
}
export const personalSalt = () => randomBytes(32).toString('base64')
