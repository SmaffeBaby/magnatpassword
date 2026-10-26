import type { TeamUnit, VaultRole } from '../types/team'
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
export const vaultRoles: { label: string; value: VaultRole }[] = [{ label: 'Наблюдатель — только просмотр', value: 'viewer' }, { label: 'Участник — редактирование карточек', value: 'member' }, { label: 'Администратор хранилища', value: 'manager' }]
export const vaultRoleLabel = (role?: VaultRole) => role === 'viewer' ? 'Наблюдатель' : role === 'manager' ? 'Администратор' : 'Участник'
export function unitPath(id: string, units: TeamUnit[]): TeamUnit[] {
  const path: TeamUnit[] = [], seen = new Set<string>(), lookup = new Map(units.map(unit => [unit.id, unit]))
  let current = lookup.get(id)
  while (current && !seen.has(current.id)) { path.unshift(current); seen.add(current.id); current = current.parentId ? lookup.get(current.parentId) : undefined }
  return path
}
export const unitLabel = (id: string, units: TeamUnit[]) => unitPath(id, units).map(unit => unit.name).join(' → ')
export function normalizeTelegram(value: string): string {
  const trimmed = value.trim().replace(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\//i, '').replace(/^@/, '').replace(/\/$/, '')
  if (!trimmed) return ''
  if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(trimmed)) throw new Error('Укажите @username или ссылку https://t.me/username')
  return trimmed.toLowerCase()
}
export function normalizePeopleQuery(value: string): string { return value.trim().replace(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\//i, '').replace(/^@/, '').replace(/\/$/, '').replace(/\s+/g, ' ').slice(0, 120) }
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]?.toUpperCase() ?? '').join('')
export function avatarMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | '' {
  if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) return ''
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) return 'image/png'
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 16 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'image/webp'
  return ''
}
