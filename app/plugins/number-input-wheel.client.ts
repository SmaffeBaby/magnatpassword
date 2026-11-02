export default defineNuxtPlugin(nuxt => {
  // Delegation also covers number inputs opened later in dialogs and menus.
  const onWheel = (event: WheelEvent) => {
    const input = event.target
    if (event.ctrlKey || event.metaKey || !event.deltaY) return
    if (!(input instanceof HTMLInputElement) || input.type !== 'number') return
    if (document.activeElement !== input || input.disabled || input.readOnly) return
    event.preventDefault()
  }

  document.addEventListener('wheel', onWheel, { capture: true, passive: false })
  const cleanup = () => document.removeEventListener('wheel', onWheel, true)
  nuxt.vueApp.onUnmount(cleanup)
  if (import.meta.hot) import.meta.hot.dispose(cleanup)
})
