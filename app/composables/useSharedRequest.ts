export async function sharedRequest<T>(url: string, options: { method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const client = useNuxtApp().$supabase
  const auth = useAuthStore(), userId = auth.user?.id
  const { data } = await client.auth.getSession()
  if (!data.session || !userId || auth.user?.id !== userId || data.session.user.id !== userId) throw new Error('Войдите в аккаунт')
  return $fetch<T>(url, { ...options, retry: 0, body: options.body as Record<string, unknown> | undefined, headers: { Authorization: `Bearer ${data.session.access_token}` } }) as Promise<T>
}
