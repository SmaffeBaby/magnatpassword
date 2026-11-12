import type { AssistantDownload, AssistantConversation } from '../types/assistant'
import type { ProjectReadTopic } from '../types/assistant-project'
import { projectReadTopic } from './assistant-project.ts'

export function isAssistantFileRequest(question: string): boolean {
  return /файл|вложен|прикрепл[её]н/iu.test(question) || /скача/iu.test(question) && !/приложен|установщик|отч[её]т|android|ios|macos|windows/iu.test(question)
}

// A generic follow-up keeps the last project section instead of jumping from contracts to inputs.
export function assistantFileTopic(question: string, previousQuestion: string, memory: AssistantConversation): ProjectReadTopic | 'team' | null {
  const explicit = projectReadTopic(question)
  if (!isAssistantFileRequest(question) || /входн|исходн/iu.test(question)) return explicit
  if (explicit && explicit !== 'inputs') return explicit
  if (/проект/iu.test(question) && !/договор|контракт/iu.test(question)) return 'overview'
  const previous = memory.topic === 'project' ? memory.projectTopic || projectReadTopic(previousQuestion) : projectReadTopic(previousQuestion)
  return previous && ['contracts', 'inputs', 'overview'].includes(previous) ? previous : explicit || 'inputs'
}

// Only these authenticated application routes may receive a download request. No model-provided URLs.
export function assistantDownloadPath(file: AssistantDownload): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const ids = file.kind === 'task' ? [file.taskId, file.fileId] : file.kind === 'contract' ? [file.projectId, file.contractId, file.fileId] : file.kind === 'input' ? [file.projectId, file.fileId] : []
  if (!ids.length || ids.some(id => !uuid.test(id))) throw new Error('Некорректная ссылка на файл. Запросите список файлов заново.')
  if (file.kind === 'task') return `/api/kaban/tasks/${file.taskId}/files/${file.fileId}`
  if (file.kind === 'contract') return `/api/projects/${file.projectId}/contracts/${file.contractId}/files/${file.fileId}`
  return `/api/projects/${file.projectId}/input-data/file?file=${file.fileId}`
}
