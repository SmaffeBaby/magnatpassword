import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import type { VaultData, EncryptedData } from '../../shared/types/vault'
function vaultKey(secret: string, id: string, epoch: number) {
  const master = Buffer.from(secret, 'base64')
  if (master.length !== 32) throw new Error('Shared vault encryption key is not configured')
  return createHmac('sha256', master).update(`shared-vault:${id}:${epoch}`).digest()
}
export function sealSharedVault(data: VaultData, secret: string, id: string, epoch: number): EncryptedData {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', vaultKey(secret, id, epoch), iv)
  cipher.setAAD(Buffer.from(`shared-vault:${id}:${epoch}`))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final(), cipher.getAuthTag()])
  return { version: 1, iv: iv.toString('base64'), ciphertext: encrypted.toString('base64') }
}
export function openSharedVault(data: EncryptedData, secret: string, id: string, epoch: number): VaultData {
  if (data.version !== 1) throw new Error('Unknown shared vault format')
  const encrypted = Buffer.from(data.ciphertext, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', vaultKey(secret, id, epoch), Buffer.from(data.iv, 'base64'))
  decipher.setAAD(Buffer.from(`shared-vault:${id}:${epoch}`))
  decipher.setAuthTag(encrypted.subarray(-16))
  return JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString('utf8'))
}
