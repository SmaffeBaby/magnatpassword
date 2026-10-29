export type AccountBrand = 'magnat' | 'light'

export function normalizeAccountBrand(value: unknown): AccountBrand {
  return value === 'light' ? 'light' : 'magnat'
}

export function resolveAccountBrand(user: { user_metadata?: Record<string, unknown> } | null, preview: AccountBrand): AccountBrand {
  return user ? normalizeAccountBrand(user.user_metadata?.account_brand) : normalizeAccountBrand(preview)
}

export function applicationForPath(path: string) {
  const section = path.replace(/\/$/, '').split('/').filter(Boolean)
  const root = section[0] === 'admin' ? section[1] : section[0]
  if (root === 'password') return { slug: 'password', name: 'Пароли' }
  if (root === 'finances') return { slug: 'finances', name: 'Финансы' }
  if (root === 'relationships') return { slug: 'relationships', name: 'Взаимосвязи' }
  if (root === 'projects') return { slug: 'projects', name: 'Проекты' }
  return null
}

export function brandProductName(brand: AccountBrand, application: ReturnType<typeof applicationForPath> = null): string {
  const name = brand === 'light' ? 'Light' : 'Magnat'
  return application ? `${name} · ${application.name}` : name
}
