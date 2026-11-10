import { invoke, isTauri } from '@tauri-apps/api/core'

export function downloadFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+|[. ]+$/g, '').slice(0, 180) || 'download'
}

export async function saveFile(blob: Blob, filename: string): Promise<boolean> {
  const name = downloadFilename(filename)
  if (isTauri()) {
    try {
      return await invoke<boolean>('save_download', { filename: name, bytes: new Uint8Array(await blob.arrayBuffer()) })
    } catch (failure) {
      const message = String(failure)
      if (/not found|not allowed|permission|unknown command/i.test(message)) throw new Error('Обновите приложение, чтобы выбирать место сохранения файлов.')
      throw new Error(message || 'Не удалось сохранить файл.')
    }
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = name
  document.body.appendChild(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}

interface SaveTarget {
  createWritable(): Promise<{
    write(data: Blob): Promise<void>
    close(): Promise<void>
    abort(): Promise<void>
  }>
}

// Open the browser picker before the first await so it retains the click gesture.
export async function downloadFileUrl(url: string, filename: string): Promise<boolean> {
  const picker = (window as Window & {
    showSaveFilePicker?: (options: { suggestedName: string }) => Promise<SaveTarget>
  }).showSaveFilePicker
  let target: SaveTarget | undefined
  try {
    if (!isTauri() && picker) target = await picker.call(window, { suggestedName: downloadFilename(filename) })
  } catch (failure) {
    if (failure instanceof Error && failure.name === 'AbortError') return false
    throw new Error('Не удалось открыть окно сохранения файла.')
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(response.status === 404
    ? 'Установщик не найден. Обновите список версий и попробуйте ещё раз.'
    : 'Не удалось скачать установщик. Попробуйте ещё раз.')
  const blob = await response.blob()
  if (!target) return saveFile(blob, filename)
  const writable = await target.createWritable()
  try {
    await writable.write(blob)
    await writable.close()
  } catch (failure) {
    await writable.abort().catch(() => {})
    throw failure
  }
  return true
}
