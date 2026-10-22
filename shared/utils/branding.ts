export type AccountBrand = 'magnat' | 'light'

export function normalizeAccountBrand(value: unknown): AccountBrand {
  return value === 'light' ? 'light' : 'magnat'
}

export function resolveAccountBrand(user: { user_metadata?: Record<string, unknown> } | null, preview: AccountBrand): AccountBrand {
  return user ? normalizeAccountBrand(user.user_metadata?.account_brand) : normalizeAccountBrand(preview)
}

export function brandProductName(brand: AccountBrand): string {
  return brand === 'light' ? 'Light Password' : 'Magnat Password'
}
