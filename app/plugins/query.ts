import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

export default defineNuxtPlugin(nuxt => {
  // One client per Nuxt app/request. Private data is kept only in memory.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: (count, failure: unknown) => {
          const status = (failure as { statusCode?: number; status?: number })?.statusCode ?? (failure as { status?: number })?.status
          return count < 1 && (!status || status >= 500)
        }
      },
      mutations: { retry: false }
    }
  })
  nuxt.vueApp.use(VueQueryPlugin, { queryClient })
  return { provide: { queryClient } }
})
