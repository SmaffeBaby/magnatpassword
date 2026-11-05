export interface SavedAccount {
  id: string
  email: string
  name: string
  avatar?: string
}

export const savedAccountsKey = 'magnat-saved-accounts-v1'
const maxAccounts = 12

// Allow-list profile fields so credentials and session tokens never enter this list.
export function parseSavedAccounts(value: string | null): SavedAccount[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]')
    if (!Array.isArray(parsed)) return []
    const accounts: SavedAccount[] = []
    for (const item of parsed) {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 128
        || typeof item.email !== 'string' || item.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) continue
      if (accounts.some(account => account.id === item.id || account.email === item.email.trim().toLowerCase())) continue
      accounts.push({ id: item.id, email: item.email.trim().toLowerCase(), name: typeof item.name === 'string' ? item.name.slice(0, 160) : '',
        ...(typeof item.avatar === 'string' && item.avatar.length < 100_000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(item.avatar) ? { avatar: item.avatar } : {}) })
      if (accounts.length === maxAccounts) break
    }
    return accounts
  } catch { return [] }
}

export function rememberAccount(accounts: SavedAccount[], account: SavedAccount): SavedAccount[] {
  return parseSavedAccounts(JSON.stringify([account, ...accounts.filter(item => item.id !== account.id && item.email !== account.email)]))
}
