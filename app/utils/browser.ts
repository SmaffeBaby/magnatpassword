// getRandomValues works on office HTTP origins; randomUUID requires HTTPS.
export function createId(): string {
  const value = crypto.getRandomValues(new Uint8Array(16))
  value[6] = (value[6]! & 0x0f) | 0x40; value[8] = (value[8]! & 0x3f) | 0x80
  const hex = Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(value); return } catch {} }
  const previous = document.activeElement as HTMLElement | null
  const field = document.createElement('textarea')
  field.value = value; field.setAttribute('readonly', ''); field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none'
  document.body.appendChild(field)
  try { field.focus(); field.select(); if (!document.execCommand('copy')) throw new Error('Clipboard unavailable') }
  finally { field.remove(); previous?.focus() }
}
