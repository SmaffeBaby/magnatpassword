import type { H3Event } from 'h3'
import type { AssistantConversation, AssistantReply, AssistantDownload } from '../../shared/types/assistant'
import type { KabanWorkspace, KabanFile } from '../../shared/types/kaban'
import { isAssistantFileRequest } from '../../shared/utils/assistant-files'
import { normalizeAssistantName } from '../../shared/utils/assistant-project'
import { assistantFetch } from './assistant-context'

export async function assistantTaskFilesRead(event: H3Event, question: string, selection: { vaultId?: string }, memory: AssistantConversation): Promise<AssistantReply | null> {
  if (!isAssistantFileRequest(question) || !/задач|кабан/iu.test(question) && memory.topic !== 'task') return null
  if (/проект|договор|входн|исходн/iu.test(question)) return null
  const workspace = await assistantFetch<KabanWorkspace>(event, `/api/kaban?vault=${encodeURIComponent(selection.vaultId || 'personal')}`)
  const query = normalizeAssistantName(question)
  const named = workspace.tasks.filter(task => normalizeAssistantName(task.title).length > 1 && query.includes(normalizeAssistantName(task.title)))
  const selected = memory.taskId && workspace.tasks.find(task => task.id === memory.taskId)
  const task = named.length === 1 ? named[0] : named.length === 0 && selected ? selected : workspace.tasks.length === 1 && !named.length ? workspace.tasks[0] : undefined
  if (!task) return { message: workspace.tasks.length ? 'Для какой задачи показать файлы? Выберите задачу ниже.' : 'В выбранном хранилище нет доступных задач.', draft: null, conversation: { topic: 'task' }, ...(workspace.tasks.length ? { choice: { kind: 'task', prompt: 'Выберите задачу', options: workspace.tasks.map(t => ({ id: t.id, label: t.title })) } } : {}) }
  const files = await assistantFetch<KabanFile[]>(event, `/api/kaban/tasks/${task.id}/files`)
  const downloads: AssistantDownload[] = files.map(file => ({ kind: 'task', taskId: task.id, fileId: file.id, name: file.name, size: file.size, source: `Кабан · ${task.title}` }))
  return { message: files.length ? `Файлы задачи «${task.title}»: ${files.length}. Нажмите «Скачать» у нужного файла.` : `У задачи «${task.title}» нет прикреплённых файлов.`, draft: null, downloads, conversation: { topic: 'task', taskId: task.id }, links: [{ label: 'Открыть Кабан', to: '/kaban' }] }
}
