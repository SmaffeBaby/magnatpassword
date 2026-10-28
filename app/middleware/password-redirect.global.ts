const legacySections = new Set(['/categories', '/subscriptions', '/finances'])

export default defineNuxtRouteMiddleware(to => {
  const path = to.path.replace(/\/$/, '') || '/'
  const destination = path === '/password/profile' ? '/profile'
    : path === '/password/team' || path.startsWith('/password/team/') ? path.slice('/password'.length)
    : legacySections.has(path) ? `/password${path}`
    : path === '/admin' ? '/admin/password' : undefined
  if (destination) return navigateTo({ path: destination, query: to.query, hash: to.hash }, { redirectCode: 301, replace: true })
})
