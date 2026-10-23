// getRandomValues works on office HTTP origins; randomUUID requires HTTPS.
export function createId(): string {
  const value = crypto.getRandomValues(new Uint8Array(16))
  value[6] = (value[6]! & 0x0f) | 0x40; value[8] = (value[8]! & 0x3f) | 0x80
  const hex = Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
export async function copyText(value: string, trigger?: HTMLElement): Promise<void> {
  if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(value); return } catch {} }
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const selection = window.getSelection()
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : []
  // Keep the fallback inside the active dialog so its focus trap can select it on HTTP origins.
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
  const host = trigger?.closest('[role="dialog"], [role="alertdialog"]')
    ?? previous?.closest('[role="dialog"], [role="alertdialog"]')
    ?? dialogs[dialogs.length - 1]
    ?? document.body
  const field = document.createElement('textarea')
  field.value = value
  field.setAttribute('readonly', '')
  field.setAttribute('aria-hidden', 'true')
  field.tabIndex = -1
  field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px;pointer-events:none'
  host.appendChild(field)
  try {
    field.focus({ preventScroll: true })
    field.select()
    field.setSelectionRange(0, value.length)
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable')
  } finally {
    field.value = ''
    field.remove()
    if (previous?.isConnected) previous.focus({ preventScroll: true })
    if (selection) { selection.removeAllRanges(); for (const range of ranges) if (range.commonAncestorContainer.isConnected) selection.addRange(range) }
  }
}
