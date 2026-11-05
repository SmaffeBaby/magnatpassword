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
