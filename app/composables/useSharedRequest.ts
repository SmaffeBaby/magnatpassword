export async function sharedRequest<T>(url: string, options: { method?: 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  const client = useNuxtApp().$supabase
  const { data } = await client.auth.getSession()
  if (!data.session) throw new Error('Войдите в аккаунт')
  return $fetch<T>(url, { ...options, body: options.body as Record<string, unknown> | undefined, headers: { Authorization: `Bearer ${data.session.access_token}` } }) as Promise<T>
}
