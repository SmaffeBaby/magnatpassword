const legacySections = new Set(['/categories', '/subscriptions', '/finances', '/profile', '/team'])

export default defineNuxtRouteMiddleware(to => {
  const path = to.path.replace(/\/$/, '') || '/'
  const destination = legacySections.has(path) || path.startsWith('/team/') ? `/password${path}`
    : path === '/admin' ? '/admin/password' : undefined
  if (destination) return navigateTo({ path: destination, query: to.query, hash: to.hash }, { redirectCode: 301, replace: true })
})
