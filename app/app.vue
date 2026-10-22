<script setup lang="ts">
const auth = useAuthStore(), vault = useVaultStore()
let cleanup: (() => void) | undefined
onMounted(async () => {
  const { $supabase } = useNuxtApp()
  await auth.restore()
  const { data } = $supabase.auth.onAuthStateChange((_event, session) => {
    if (auth.user?.id !== session?.user.id) vault.lock()
    auth.user = session?.user ?? null
  })
  let activity = Date.now()
  const touch = () => { activity = Date.now() }
  const timer = window.setInterval(() => { if (vault.unlocked && Date.now() - activity > 5 * 60_000) vault.lock() }, 5000)
  const events = ['pointerdown', 'keydown', 'scroll']
  events.forEach(event => window.addEventListener(event, touch, { passive: true }))
  const hide = () => { if (document.visibilityState === 'visible' && Date.now() - activity > 5 * 60_000) vault.lock() }
  document.addEventListener('visibilitychange', hide)
  window.addEventListener('pagehide', vault.lock)
  cleanup = () => { clearInterval(timer); data.subscription.unsubscribe(); events.forEach(event => window.removeEventListener(event, touch)); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', vault.lock); vault.lock() }
})
onBeforeUnmount(() => cleanup?.())
</script>
<template><UApp><NuxtPage /></UApp></template>
