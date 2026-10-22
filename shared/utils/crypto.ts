import type { EncryptedData, VaultData } from '../types/vault'
export const KDF_ITERATIONS = 600_000
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))
export const createSalt = () => encode(crypto.getRandomValues(new Uint8Array(32)))
export async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: decode(salt), iterations: KDF_ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function encryptVault(data: VaultData, key: CryptoKey, owner: string): Promise<EncryptedData> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(owner) }, key, new TextEncoder().encode(JSON.stringify(data))))
  // Chunk large payloads to avoid overflowing the JS call stack.
  let binary = ''; for (let i = 0; i < ciphertext.length; i += 8192) binary += String.fromCharCode(...ciphertext.subarray(i, i + 8192))
  return { version: 1, iv: encode(iv), ciphertext: btoa(binary) }
}
export async function decryptVault(data: EncryptedData, key: CryptoKey, owner: string): Promise<VaultData> {
  if (data.version !== 1) throw new Error('Неизвестный формат хранилища')
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(data.iv), additionalData: new TextEncoder().encode(owner) }, key, decode(data.ciphertext))
  const parsed = JSON.parse(new TextDecoder().decode(plain))
  if (parsed.version !== 1 || !Array.isArray(parsed.entries) || !Array.isArray(parsed.categories)) throw new Error('Повреждённое хранилище')
  return parsed
}
export function generatePassword(length = 24): string {
  if (!Number.isInteger(length) || length < 12 || length > 128) throw new Error('Длина от 12 до 128 символов')
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-=?'
  const result: string[] = []
  while (result.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < 256 - (256 % alphabet.length)) result.push(alphabet[byte % alphabet.length]!)
      if (result.length === length) break
    }
  }
  const password = result.join('')
  return /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password) ? password : generatePassword(length)
}
export function safeUrl(value: string): string | undefined {
  try { const url = new URL(value.includes('://') ? value : `https://${value}`); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}
