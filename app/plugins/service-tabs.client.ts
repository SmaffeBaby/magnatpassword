export default defineNuxtPlugin(nuxt => {
  const tabs = useServiceTabsStore()
  const auth = useAuthStore()
  nuxt.hook('app:beforeMount', tabs.start)
  watch(() => auth.user?.id, tabs.setAccount, { immediate: true, flush: 'sync' })
})
