import { useQueryClient } from '@tanstack/vue-query'
import type { OfficeFile, OfficeSource, OfficeTarget } from '~~/shared/types/office'
import type { ProjectDocument } from '~~/shared/types/project-documents'
import { officeFileUrl } from '~~/shared/utils/office'
import { documentEditor, documentMaxSize } from '~~/shared/utils/project-documents'
import { saveFile } from '~/utils/file-download'
export interface OfficeEditorAdapter { load: () => Promise<Blob>; save: (blob: Blob, name: string, copy: boolean, saveAs: boolean) => Promise<ProjectDocument>; setDestination?: (destination: string) => void }
interface OfficeSession { key: string; file: ProjectDocument; adapter: OfficeEditorAdapter }
interface SaveChoice { name: string; resolve: (target: OfficeTarget | 'download') => void; reject: (error: Error) => void }
function editorFile(name: string, size: number, editable = true): ProjectDocument { return { id: crypto.randomUUID(), folderId: null, name, type: 'application/octet-stream', size, revision: 1, description: '', tags: [], permission: editable ? 'editor' : 'viewer', canManage: false, createdBy: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }
export function useOffice() {
  const auth = useAuthStore(), queryClient = useQueryClient()
  const session = useState<OfficeSession | null>('office-session', () => null), choice = useState<SaveChoice | null>('office-save-choice', () => null)
  function choose(name: string) { return new Promise<OfficeTarget | 'download'>((resolve, reject) => { choice.value = { name, resolve, reject } }) }
  function cancelChoice() { choice.value?.reject(new Error('Сохранение отменено. Файл остаётся в редакторе.')); choice.value = null }
  function resolveChoice(target: OfficeTarget | 'download') { choice.value?.resolve(target); choice.value = null }
  async function upload(target: OfficeTarget, blob: Blob, name: string): Promise<OfficeFile> {
    const body = new FormData(); body.append('file', blob, name)
    let url = '', source: OfficeSource
    if (target.kind === 'document') { url = `/api/projects/${target.projectId}/documents`; if (target.folderId) body.append('folderId', target.folderId) }
    else if (target.kind === 'input') {
      url = `/api/projects/${target.projectId}/input-data/upload`; body.append('cardId', target.recordId!); body.append('revision', String(target.revision))
    } else if (target.kind === 'task') url = `/api/kaban/tasks/${target.recordId}/files`
    else if (target.kind === 'contract') url = `/api/projects/${target.projectId}/contracts/${target.recordId}/files`
    else { url = `/api/contract-register/standalone/${target.recordId}/files`; body.append('fileId', crypto.randomUUID()) }
    const result: any = await sharedRequest(url, { method: 'POST', body })
    const fileId = target.kind === 'input' ? result.cards.find((c: any) => c.id === target.recordId)?.attachments.at(-1)?.id : result.file?.id ?? result.id
    source = { kind: target.kind, projectId: target.projectId, recordId: target.recordId, fileId }
    return sharedRequest<OfficeFile>(officeFileUrl(source))
  }
  function launch(name: string, load: () => Promise<Blob>, initial?: OfficeFile, target?: OfficeTarget) {
    if (session.value) throw new Error('Сначала закройте открытый редактор')
    if (!documentEditor(name)) throw new Error('Для этого формата пока нет редактора')
    const actor = auth.user?.id
    let current = initial, mode = 'source', local = editorFile(name, initial?.size ?? 0, initial?.canEdit ?? true)
    const adapter: OfficeEditorAdapter = {
      load, setDestination: value => { mode = value },
      async save(blob, outputName, copy, saveAs) {
        if (auth.user?.id !== actor) throw new Error('Аккаунт изменился. Откройте редактор заново.')
        if (mode === 'download' || current && !current.canEdit && mode === 'source') {
          if (!await saveFile(blob, outputName)) throw new Error('Скачивание отменено')
          return local
        }
        if (blob.size > documentMaxSize) throw new Error('Файл больше 20 МБ. Выберите скачивание на устройство.')
        let saved: OfficeFile | undefined
        if (mode === 'source' && current?.canEdit && !copy) {
          const body = new FormData(); body.append('source', JSON.stringify(current.source)); body.append('token', current.token); body.append('file', blob, outputName)
          saved = await sharedRequest<OfficeFile>('/api/office/file', { method: 'PUT', body })
        } else {
          const destination = mode === 'source' && !current && target ? target : await choose(outputName)
          if (auth.user?.id !== actor) throw new Error('Аккаунт изменился')
          if (destination === 'download') { if (!await saveFile(blob, outputName)) throw new Error('Скачивание отменено'); return local }
          saved = await upload(destination, blob, outputName)
        }
        if (!copy || saveAs || !current) { current = saved; local = editorFile(saved.name, saved.size, saved.canEdit) }
        await queryClient.invalidateQueries({ queryKey: ['account', actor] })
        return local
      }
    }
    session.value = { key: crypto.randomUUID(), file: local, adapter }
  }
  async function openSource(source: OfficeSource) {
    const actor = auth.user?.id, file = await sharedRequest<OfficeFile>(officeFileUrl(source))
    if (auth.user?.id !== actor) return
    launch(file.name, () => sharedRequest<Blob>(`${officeFileUrl(file.source)}&content=1&token=${file.token}`, { responseType: 'blob' }), file)
  }
  function openBlob(blob: Blob, name: string, target?: OfficeTarget) { if (blob.size > documentMaxSize) throw new Error('Для редактора нужен файл до 20 МБ'); launch(name, async () => blob, undefined, target) }
  function close() { cancelChoice(); session.value = null }
  return { session, choice, resolveChoice, cancelChoice, close, openSource, openBlob, upload }
}
