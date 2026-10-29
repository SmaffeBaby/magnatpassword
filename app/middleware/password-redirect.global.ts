const legacySections: Record<string, string> = {
  '/password/relationships': '/relationships/map',
  '/categories': '/password/categories',
  '/subscriptions': '/finances/subscriptions',
  '/password/subscriptions': '/finances/subscriptions',
  '/password/finances': '/finances'
}
const financeViews: Record<string, string> = {
  relationships: '/relationships/map',
  subscriptions: '/finances/calendar', upcoming: '/finances/subscriptions',
  finances: '/finances', history: '/finances/history'
}

export default defineNuxtRouteMiddleware(to => {
  const path = to.path.replace(/\/$/, '') || '/'
  const financeView = path === '/password' && typeof to.query.view === 'string' ? financeViews[to.query.view] : undefined
  const destination = financeView ?? (path === '/password/profile' ? '/profile'
    : path === '/password/team' || path.startsWith('/password/team/') ? path.slice('/password'.length)
    : legacySections[path]
    ?? (path === '/admin' ? '/admin/password' : undefined))
  if (destination) {
    const query = { ...to.query }
    if (financeView) delete query.view
    return navigateTo({ path: destination, query, hash: to.hash }, { redirectCode: 301, replace: true })
  }
})
