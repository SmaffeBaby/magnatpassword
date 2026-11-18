// PhotoCraft 0.23.1 has browser Open/drop and download-based Save, but no host bridge.
// Adapt those public browser interfaces without changing the upstream editor or wasm.
(() => {
  if (window.parent === window || window.__magnatPhotoBridge) return
  window.__magnatPhotoBridge = true
  const origin = location.origin, blobs = new Map(), pending = new Map()
  let opened = false, ready = false, sequence = 0
  const post = (kind, data = {}) => window.parent.postMessage({ type: `photocraft:${kind}`, ...data }, origin)
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
  URL.createObjectURL = object => { const url = create(object); if (object instanceof Blob) blobs.set(url, object); return url }
  URL.revokeObjectURL = url => { blobs.delete(url); revoke(url) }
  const click = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () {
    const name = this.download, blob = blobs.get(this.href)
    if (!opened || !blob || !name) return click.call(this)
    const id = `magnat-photo-${++sequence}`
    pending.set(id, true)
    void blob.arrayBuffer().then(bytes => post('save', { name, bytes, id, mime: blob.type })).catch(() => post('failed', { id, error: 'Не удалось получить сохраняемое изображение' }))
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== origin || !event.data) return
    const data = event.data
    if (data.type === 'photocraft:open' && !opened) {
      try {
        if (!(data.bytes instanceof ArrayBuffer) || !data.bytes.byteLength || data.bytes.byteLength > 20 * 1024 * 1024 || typeof data.name !== 'string') throw new Error('Некорректное изображение')
        const canvas = document.getElementById('photocraft_canvas')
        if (!canvas) throw new Error('Редактор ещё не готов')
        const files = new DataTransfer(); files.items.add(new File([data.bytes], data.name, { type: 'application/octet-stream' }))
        const rect = canvas.getBoundingClientRect()
        for (const kind of ['dragenter','dragover','drop']) canvas.dispatchEvent(new DragEvent(kind, { dataTransfer: files, bubbles: true, cancelable: true, clientX: rect.left + 10, clientY: rect.top + 10 }))
        opened = true
      } catch (failure) { post('failed', { error: failure.message || 'Не удалось открыть изображение' }) }
    } else if (data.type === 'photocraft:saved' && pending.has(data.id)) {
      pending.delete(data.id)
    } else if (data.type === 'photocraft:failed' && pending.has(data.id)) {
      pending.delete(data.id)
    }
  })
  // PhotoCraft exposes no browser dirty-state API in this release. Conservatively
  // guard genuine document interactions, never animation or synthetic file opening.
  const dirty = event => { if (opened && event.isTrusted && event.target instanceof Element && event.target.closest('canvas, input, textarea')) post('dirty', { dirty: true }) }
  window.addEventListener('pointerdown', dirty, true)
  window.addEventListener('beforeinput', dirty, true)
  const announce = () => {
    if (!ready && document.getElementById('photocraft_canvas') && !document.getElementById('photocraft_loading')) {
      ready = true; observer.disconnect(); post('ready', { version: '1', appVersion: '0.23.1', file: false })
    }
  }
  const observer = new MutationObserver(announce)
  observer.observe(document.body, { childList: true, subtree: true })
  announce()
})()
