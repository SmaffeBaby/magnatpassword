import { invoke, isTauri } from '@tauri-apps/api/core'

export default defineNuxtPlugin(nuxtApp => {
  if (!isTauri()) return
  const toast = useToast()
  function report(failure: unknown) {
    toast.add({ title: 'Не удалось выполнить действие', description: /not found|not allowed|permission|unknown command/i.test(String(failure))
      ? 'Обновите приложение для открытия ссылок и сохранения файлов.' : failure instanceof Error ? failure.message : String(failure), color: 'error' })
  }
  function click(event: MouseEvent) {
    if (event.defaultPrevented || !(event.target instanceof Element) || (event.type === 'auxclick' && event.button !== 1)) return
    const anchor = event.target.closest<HTMLAnchorElement>('a[href]')
    if (!anchor) return
    const url = new URL(anchor.href, location.href)
    if (anchor.hasAttribute('download')) {
      if (!['http:', 'https:', 'blob:', 'data:'].includes(url.protocol)) return
      event.preventDefault(); event.stopPropagation()
      void (async () => {
        const result = await fetch(url.href, { credentials: url.origin === location.origin ? 'same-origin' : 'omit' })
        if (!result.ok) throw new Error('Не удалось скачать файл.')
        await saveFile(await result.blob(), anchor.download || url.pathname.split('/').pop() || 'download')
      })().catch(report)
      return
    }
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return
    if (url.origin === location.origin && anchor.target !== '_blank' && ['http:', 'https:'].includes(url.protocol)) return
    event.preventDefault(); event.stopPropagation()
    void invoke('open_external', { url: url.href }).catch(report)
  }
  document.addEventListener('click', click, true)
  document.addEventListener('auxclick', click, true)
  nuxtApp.vueApp.onUnmount(() => {
    document.removeEventListener('click', click, true)
    document.removeEventListener('auxclick', click, true)
  })
})
