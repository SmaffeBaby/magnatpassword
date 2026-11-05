export const accountAccessKey = 'magnat-account-access-v1'
export const logoutOptions = [
  { label: '5 минут', value: 5 }, { label: '10 минут', value: 10 },
  { label: '15 минут', value: 15 }, { label: '20 минут', value: 20 },
  { label: '30 минут', value: 30 }, { label: 'Час', value: 60 },
  { label: 'Два часа', value: 120 }, { label: 'Никогда', value: 0 }
]
export interface AccountAccess {
  rememberPassword: boolean
  logoutMinutes: number
  lastActivity: number
  signedOut: boolean
  session?: { access_token: string; refresh_token: string }
}
export function defaultAccountAccess(): AccountAccess {
  return { rememberPassword: false, logoutMinutes: 5, lastActivity: Date.now(), signedOut: false }
}
export function parseAccountAccess(value: string | null): Record<string, AccountAccess> {
  try {
    const data: unknown = JSON.parse(value || '{}')
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    const result: Record<string, AccountAccess> = Object.create(null)
    for (const [id, item] of Object.entries(data).slice(0, 50)) {
      if (!item || typeof item !== 'object' || ['__proto__', 'constructor', 'prototype'].includes(id)) continue
      const record = item as Record<string, any>
      result[id] = {
        rememberPassword: record.rememberPassword === true,
        logoutMinutes: logoutOptions.some(option => option.value === record.logoutMinutes) ? record.logoutMinutes : 5,
        lastActivity: Number.isFinite(record.lastActivity) && record.lastActivity > 0 ? record.lastActivity : 0,
        signedOut: record.signedOut === true,
        ...(record.rememberPassword === true && typeof record.session?.access_token === 'string' && typeof record.session?.refresh_token === 'string'
          ? { session: { access_token: record.session.access_token, refresh_token: record.session.refresh_token } } : {})
      }
    }
    return result
  } catch { return {} }
}
export function accountIdleExpired(access: AccountAccess, now = Date.now()): boolean {
  return access.logoutMinutes > 0 && now - access.lastActivity >= access.logoutMinutes * 60_000
}
