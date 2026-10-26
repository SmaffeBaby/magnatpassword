export function useAccountQueries() {
  const client = useNuxtApp().$queryClient
  const auth = useAuthStore()
  const prefix = (resource?: string) => ['account', auth.user?.id ?? 'signed-out', ...(resource ? [resource] : [])]
  async function read<T>(resource: string, url: string, options: { force?: boolean; staleTime?: number } = {}): Promise<T> {
    if (!auth.user) throw new Error('Войдите в аккаунт')
    const userId = auth.user.id
    const queryKey = [...prefix(resource), url]
    if (options.force) await client.invalidateQueries({ queryKey, exact: true, refetchType: 'none' })
    if (auth.user?.id !== userId) throw new Error('Аккаунт изменился')
    return client.fetchQuery<T>({ queryKey, staleTime: options.staleTime ?? 60_000, queryFn: ({ signal }) => {
      if (auth.user?.id !== userId || signal.aborted) throw new Error('Запрос отменён')
      return sharedRequest<T>(url, { signal })
    } })
  }
  async function invalidate(...resources: string[]) {
    await Promise.all(resources.map(async resource => {
      const queryKey = prefix(resource)
      await client.cancelQueries({ queryKey })
      await client.invalidateQueries({ queryKey, refetchType: 'none' })
    }))
  }
  function set<T>(resource: string, url: string, data: T) { client.setQueryData([...prefix(resource), url], data) }
  return { read, invalidate, set, clear: () => client.clear() }
}
