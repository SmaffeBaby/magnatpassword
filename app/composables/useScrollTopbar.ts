/** Keep the header mounted while changing its visibility with scroll direction. */
export function useScrollTopbar() {
  const hidden = ref(false)
  let anchor = 0
  let frame = 0
  const position = () => Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - window.innerHeight))
  function reset() { hidden.value = false; anchor = position() }
  function update() {
    frame = 0
    const current = position()
    const delta = current - anchor
    if (current <= 78) { hidden.value = false; anchor = current; return }
    if (Math.abs(delta) < 8) return
    hidden.value = delta > 0
    anchor = current
  }
  function onScroll() { if (!frame) frame = requestAnimationFrame(update) }
  onMounted(() => {
    reset()
    window.addEventListener('scroll', onScroll, { passive: true })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    cancelAnimationFrame(frame)
  })
  return { topbarHidden: hidden, resetTopbar: reset }
}
