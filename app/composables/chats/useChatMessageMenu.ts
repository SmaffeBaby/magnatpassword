import { useEventListener } from '@vueuse/core'

const holdDelay = 500
const moveTolerance = 10

type MessageMenu = {
  messageId: string
  anchor: HTMLElement
  reference: { getBoundingClientRect: () => DOMRect }
}
type Press = {
  pointerId: number
  x: number
  y: number
  timer: ReturnType<typeof setTimeout>
}
type HeldGesture = { anchor: HTMLElement; pointerId?: number; x: number; y: number }

export function useChatMessageMenu() {
  const menu = shallowRef<MessageMenu | null>(null)
  let press: Press | undefined
  let held: HeldGesture | undefined

  function cancelPress() {
    if (press) clearTimeout(press.timer)
    press = undefined
  }
  function closeMenu() {
    cancelPress()
    menu.value = null
  }
  function openMenu(messageId: string, anchor: HTMLElement, x: number, y: number) {
    cancelPress()
    if (!anchor.isConnected) return
    menu.value = { messageId, anchor, reference: { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) } }
  }
  function startPress(event: PointerEvent, messageId: string) {
    if ((event.pointerType !== 'touch' && event.pointerType !== 'pen') || !event.isPrimary || event.button !== 0) return
    const anchor = event.currentTarget as HTMLElement
    const { clientX: x, clientY: y, pointerId } = event
    cancelPress()
    press = {
      x, y, pointerId,
      timer: setTimeout(() => {
        held = { anchor, pointerId, x, y }
        openMenu(messageId, anchor, x, y)
      }, holdDelay)
    }
  }
  function openFromMouse(event: MouseEvent, disabled: boolean) {
    const mouseDown = event.type === 'mousedown'
    const controlClick = event.button === 0 && event.ctrlKey
    // The compatibility mouse event after a long press must not move focus out of the menu.
    if (mouseDown && event.button === 0 && held) {
      event.preventDefault()
      return
    }
    if (mouseDown && event.button !== 2 && !controlClick) return

    const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
    const row = target?.closest<HTMLElement>('[data-chat-message-id]')
    const messageId = row?.dataset.chatMessageId
    const anchor = row?.querySelector<HTMLElement>('.chat-context-trigger')
    if (!messageId || !anchor) return
    event.preventDefault()
    if (disabled) return
    const touchMenu = !mouseDown && (press || ('pointerType' in event && (event.pointerType === 'touch' || event.pointerType === 'pen')))
    const x = touchMenu && press ? press.x : event.clientX
    const y = touchMenu && press ? press.y : event.clientY
    if (touchMenu || mouseDown && controlClick) held = { anchor, pointerId: press?.pointerId, x, y }
    const previous = menu.value?.messageId === messageId ? menu.value.reference.getBoundingClientRect() : null
    if (previous?.x === x && previous.y === y) return
    openMenu(messageId, anchor, x, y)
  }
  function openFromTimestamp(event: MouseEvent, messageId: string) {
    const timestamp = event.currentTarget as HTMLElement
    const bounds = timestamp.getBoundingClientRect()
    openMenu(messageId, timestamp, bounds.left, bounds.bottom)
  }
  function openFromKeyboard(event: KeyboardEvent, messageId: string) {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    const anchor = event.currentTarget as HTMLElement
    const bounds = anchor.getBoundingClientRect()
    openMenu(messageId, anchor, bounds.left, bounds.bottom)
  }
  function restoreFocus() {
    const anchor = menu.value?.anchor
    if (anchor) void nextTick(() => anchor.focus({ preventScroll: true }))
  }

  if (import.meta.client) {
    useEventListener(window, 'pointerdown', () => {
      held = undefined
      cancelPress()
    }, { capture: true, passive: true })
    useEventListener(window, 'pointermove', event => {
      if (press?.pointerId === event.pointerId &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > moveTolerance) cancelPress()
    }, { passive: true })
    useEventListener(window, ['pointerup', 'pointercancel'], event => {
      if (press?.pointerId === event.pointerId) cancelPress()
    }, { passive: true })
    useEventListener(window, 'click', event => {
      if (!held || !event.detail) return
      const { anchor, pointerId, x, y } = held
      held = undefined
      if ((pointerId !== undefined && 'pointerId' in event && event.pointerId === pointerId) ||
        (event.target instanceof Node && anchor.contains(event.target)) ||
        Math.hypot(event.clientX - x, event.clientY - y) <= moveTolerance) {
        event.preventDefault()
        event.stopPropagation()
      }
    }, { capture: true })
    useEventListener(window, 'blur', cancelPress)
  }
  onScopeDispose(cancelPress)

  return { menu, closeMenu, startPress, openFromMouse, openFromKeyboard, openFromTimestamp, restoreFocus }
}
