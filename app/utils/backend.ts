import { $fetch } from 'ofetch'
import { resolveBackendUrl } from '~~/shared/utils/backend-url'

// Initialized once by the client plugin, before any stores restore their sessions.
// Keeping the URL here also allows calls after await without a Nuxt context.
let backendOrigin = ''
export function configureBackend(origin: string): void {
  backendOrigin = origin
}
export function backendUrl(path: string): string {
  return resolveBackendUrl(path, backendOrigin)
}
export const backendFetch: typeof $fetch = $fetch.create({
  onRequest({ request, options }) {
    if (typeof request === 'string') options.baseURL = /^\/api(?:\/|$)/.test(request) ? backendOrigin : undefined
  }
})
