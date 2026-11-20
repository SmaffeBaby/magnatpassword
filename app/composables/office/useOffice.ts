import { useQueryClient } from '@tanstack/vue-query'
import type { OfficeFile, OfficeSource, OfficeTarget } from '~~/shared/types/office'
import type { ProjectChatFile } from '~~/shared/types/project-chats'
import type { ProjectDocument } from '~~/shared/types/project-documents'
import type { ServiceTabEditor } from '~/stores/serviceTabs'
import { officeFileUrl } from '~~/shared/utils/office'
import { documentEditor, documentMaxSize } from '~~/shared/utils/project-documents'
import { saveFile } from '~/utils/file-download'
export interface OfficeEditorAdapter { load: () => Promise<Blob>; save: (blob: Blob, name: string, copy: boolean, saveAs: boolean) => Promise<ProjectDocument>; setDestination?: (destination: string) => void }
interface OfficeSession { key: string; file: ProjectDocument; adapter: OfficeEditorAdapter; allowChooseDestination?: boolean }
interface SaveChoice { name: string; resolve: (target: OfficeTarget | 'download') => void; reject: (error: Error) => void }
type Attachment = Extract<ServiceTabEditor, { kind: 'chat' | 'space' }>
type Resume = { id: string; signal: AbortSignal }
function editorFile(name: string, size: number, editable = true): ProjectDocument { return { id: crypto.randomUUID(), folderId: null, name, type: 'application/octet-stream', size, revision: 1, description: '', tags: [], permission: editable ? 'editor' : 'viewer', canManage: false, createdBy: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }
export function useOffice() {
  const auth = useAuthStore(), queryClient = useQueryClient(), tabs = useServiceTabsStore(), chatHub = useChatHubStore()
  const sessions = useState<Record<string, OfficeSession>>('office-sessions', () => ({}))
  const choices = useState<Record<string, SaveChoice>>('office-save-choices', () => ({}))
  const reopening = useState<{ id: string; loading: boolean; error: string } | null>('office-reopening', () => null)
  const session = computed(() => sessions.value[tabs.activeId])
  const choice = computed(() => choices.value[tabs.activeId])
  function choose(id: string, name: string) { return new Promise<OfficeTarget | 'download'>((resolve, reject) => { choices.value[id] = { name, resolve, reject } }) }
  function cancelChoice(id = tabs.activeId) {
    choices.value[id]?.reject(new Error('Сохранение отменено. Файл остаётся в редакторе.'))
    delete choices.value[id]
  }
  function resolveChoice(target: OfficeTarget | 'download') { choice.value?.resolve(target); delete choices.value[tabs.activeId] }
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
  async function show(file: ProjectDocument, adapter: OfficeEditorAdapter, origin: ServiceTabEditor, id: string, resume?: Resume, allowChooseDestination = true) {
    const editor = documentEditor(file.name)
    if (!editor) throw new Error('Для этого формата пока нет редактора')
    if (resume && (resume.signal.aborted || tabs.activeId !== id)) return
    sessions.value[id] = { key: id, file, adapter, allowChooseDestination }
    if (resume) return
    try {
      if (await tabs.open(`/office/${editor.key}`, file.name, id, origin)) {
        chatHub.opened = false
        return
      }
      throw new Error('Не удалось открыть вкладку редактора')
    } catch (error) {
      delete sessions.value[id]
      throw error
    }
  }
  function launch(name: string, load: () => Promise<Blob>, initial?: OfficeFile, target?: OfficeTarget, resume?: Resume) {
    const id = resume?.id ?? crypto.randomUUID()
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
          const destination = mode === 'source' && !current && target ? target : await choose(id, outputName)
          if (auth.user?.id !== actor) throw new Error('Аккаунт изменился')
          if (destination === 'download') { if (!await saveFile(blob, outputName)) throw new Error('Скачивание отменено'); return local }
          saved = await upload(destination, blob, outputName)
        }
        if (!copy || saveAs || !current) {
          current = saved
          local = editorFile(saved.name, saved.size, saved.canEdit)
          tabs.setEditor(id, { kind: 'office', source: saved.source }, saved.name)
        }
        await queryClient.invalidateQueries({ queryKey: ['account', actor] })
        return local
      }
    }
    return show(local, adapter, initial ? { kind: 'office', source: initial.source } : { kind: 'local' }, id, resume)
  }
  async function openSource(source: OfficeSource, resume?: Resume) {
    const actor = auth.user?.id, file = await sharedRequest<OfficeFile>(officeFileUrl(source), { signal: resume?.signal })
    if (auth.user?.id !== actor) return
    await launch(file.name, () => sharedRequest<Blob>(`${officeFileUrl(file.source)}&content=1&token=${file.token}`, { responseType: 'blob' }), file, undefined, resume)
  }
  async function openBlob(blob: Blob, name: string, target?: OfficeTarget) {
    if (blob.size > documentMaxSize) throw new Error('Для редактора нужен файл до 20 МБ')
    await launch(name, async () => blob, undefined, target)
  }
  async function openAttachment(source: Attachment, resume?: Resume) {
    const actor = auth.user?.id, { projectId, fileId } = source
    const directory = source.kind === 'chat'
      ? `/api/projects/${projectId}/chats/${source.chatId}/files`
      : `/api/projects/${projectId}/spaces/${source.spaceId}/files`
    const url = `${directory}/${fileId}`
    const request = { signal: resume?.signal }
    let file: ProjectDocument
    if (source.kind === 'chat') {
      const metadata = await sharedRequest<ProjectChatFile>(`${url}?meta=1`, request)
      file = { ...editorFile(metadata.name, metadata.size, metadata.canEdit), ...metadata }
    } else {
      const files = await sharedRequest<ProjectDocument[]>(directory, request)
      const asset = files.find(item => item.id === fileId)
      if (!asset) throw new Error('Файл пространства недоступен')
      file = asset
    }
    if (auth.user?.id !== actor) return
    const id = resume?.id ?? crypto.randomUUID()
    let mode = 'source'
    await show(file, {
      load: () => sharedRequest<Blob>(source.kind === 'chat' ? `${url}?revision=${file.revision}` : url, { responseType: 'blob' }),
      setDestination: value => { mode = value },
      async save(blob, name, copy) {
        if (auth.user?.id !== actor) throw new Error('Аккаунт изменился')
        if (source.kind !== 'chat' || file.permission === 'viewer' || copy || mode === 'download') {
          if (!await saveFile(blob, name)) throw new Error('Скачивание отменено')
          return file
        }
        const body = new FormData()
        body.append('file', blob, name); body.append('revision', String(file.revision))
        const updated = await sharedRequest<ProjectChatFile>(url, { method: 'PUT', body })
        file = { ...file, ...updated }
        tabs.setEditor(id, source, file.name)
        await queryClient.invalidateQueries({ queryKey: ['account', actor, 'project-chats', projectId] })
        return file
      }
    }, source, id, resume, false)
  }
  async function reopen(id: string, origin: Exclude<ServiceTabEditor, { kind: 'local' }>, signal: AbortSignal) {
    if (sessions.value[id]) return
    reopening.value = { id, loading: true, error: '' }
    try {
      if (origin.kind === 'office') await openSource(origin.source, { id, signal })
      else await openAttachment(origin, { id, signal })
      if (!signal.aborted) reopening.value = null
    } catch (failure: any) {
      if (!signal.aborted) reopening.value = { id, loading: false, error: failure?.data?.message || failure?.message || 'Не удалось восстановить файл' }
    }
  }
  async function close(id: string) {
    if (!await tabs.remove(id)) return
    tabs.setCloseHandler(id)
    cancelChoice(id)
    delete sessions.value[id]
  }
  function clear() {
    for (const id of Object.keys(choices.value)) cancelChoice(id)
    for (const id of Object.keys(sessions.value)) {
      tabs.setCloseHandler(id)
      tabs.cancelReplacement(id)
    }
    sessions.value = {}
    reopening.value = null
  }
  return { sessions, session, choice, reopening, resolveChoice, cancelChoice, close, clear, openSource, openBlob, openAttachment, reopen, upload }
}
