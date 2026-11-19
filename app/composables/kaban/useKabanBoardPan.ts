export function useKabanBoardPan(boardElement: Readonly<Ref<HTMLElement | null>>) {
  let pan: { board: HTMLElement; pointerId: number; x: number; scrollLeft: number; moved: boolean } | undefined

  function start(event: PointerEvent) {
    const board = boardElement.value
    if (pan || event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0 || !board || board.scrollWidth <= board.clientWidth) return
    if (!(event.target instanceof Element) || event.target.closest('.kaban-task-card,button,a,input,select,textarea,[contenteditable],[draggable="true"]')) return

    event.preventDefault()
    board.setPointerCapture(event.pointerId)
    pan = { board, pointerId: event.pointerId, x: event.clientX, scrollLeft: board.scrollLeft, moved: false }
  }

  function stop(event?: PointerEvent) {
    if (!pan || (event && pan.pointerId !== event.pointerId)) return
    const { board, pointerId } = pan
    pan = undefined
    board.classList.remove('is-panning')
    if (board.hasPointerCapture(pointerId)) board.releasePointerCapture(pointerId)
  }

  function move(event: PointerEvent) {
    if (!pan || pan.pointerId !== event.pointerId) return
    if (!(event.buttons & 1)) return stop(event)

    const delta = event.clientX - pan.x
    if (!pan.moved) {
      if (Math.abs(delta) < 5) return
      pan.moved = true
      pan.board.classList.add('is-panning')
    }
    pan.board.scrollLeft = pan.scrollLeft - delta
  }

  watch(boardElement, () => stop())
  onBeforeUnmount(() => stop())
  return { start, move, stop }
}
