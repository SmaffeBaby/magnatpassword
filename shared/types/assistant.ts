export interface AssistantDraft {
  title: string
  url: string
  username: string
  password: string
  notes: string
}
export interface AssistantReply {
  choice?: AssistantChoice
  conversation?: AssistantConversation
  projectId?: string
  action?: AssistantAction
  message: string
  draft: AssistantDraft | null
  links?: { label: string; to: string }[]
}

export interface AssistantAction {
  kind: 'create_task' | 'edit_task' | 'move_task' | 'attach_files'
  title: string
  description: string
  dueOn: string
  taskName: string
  stageName: string
}
export interface AssistantUploadTarget {
  id: string
  label: string
  kind: 'contract' | 'input' | 'task'
  projectId?: string
  recordId: string
  revision?: number
  blockId?: string
}
export interface AssistantContext {
  projects: { id: string; name: string; permission: string }[]
  vaults: { id: string; name: string; canEdit?: boolean }[]
  kaban: import('./kaban').KabanWorkspace | null
  project: { id: string; name: string; permission: string } | null
  projectData: Record<string, unknown> | null
  uploadTargets: AssistantUploadTarget[]
  relations: { site?: string; key: string; title: string; vault: string; subscriptions: { title: string; relation: string; paidUntil: string; price: number; currency: string }[] }[]
  warnings: string[]
}

export interface AssistantQueueStatus {
  state: 'queued' | 'running'
  position: number
  waiting: number
  waitedMs: number
}

export interface AssistantChoice {
  kind: 'project' | 'vault' | 'record' | 'person'
  prompt: string
  options: { id: string; label: string; disabled?: boolean }[]
}
export interface AssistantConversation {
  personId?: string
  personName?: string
  recordKey?: string
  relationQuery?: string
  topic?: 'person' | 'site' | 'project' | 'relationships'
}
