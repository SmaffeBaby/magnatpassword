import type { H3Event } from 'h3'
import type { AssistantContext } from '../../shared/types/assistant'
import type { KabanWorkspace } from '../../shared/types/kaban'
import type { Project } from '../../shared/types/projects'
import type { ProjectEstimate } from '../../shared/types/estimate'
import type { ProjectProcess } from '../../shared/types/project-process'
import { estimateAmounts, estimateFinancials } from '../../shared/utils/estimate'
import type { ProjectInputs } from '../../shared/types/project-inputs'
import type { SharedVault, SharedCard } from '../../shared/types/sharing'
import type { VaultData } from '../../shared/types/vault'
import { projectSharedCards } from '../../shared/utils/shared-card-sources'
import { sourceEntries } from '../../shared/utils/vault-sources'
import { assistantRelations } from '../../shared/utils/assistant-relations'

// Calls the same authenticated endpoints as the normal UI. Never accepts a model-provided URL.
export function assistantFetch<T>(event: H3Event, path: string, options: Record<string, unknown> = {}): Promise<T> {
  return event.$fetch(path, { ...options, headers: { ...(options.headers as Record<string, string> || {}), authorization: getHeader(event, 'authorization') || '' } }) as Promise<T>
}
export async function assistantContext(event: H3Event, selected: { projectId?: string; vaultId?: string } = {}): Promise<AssistantContext> {
  const result: AssistantContext = { projects: [], vaults: [], kaban: null, project: null, projectData: null, uploadTargets: [], relations: [], warnings: [] }
  async function optional<T>(path: string, label: string): Promise<T | null> {
    try { return await assistantFetch<T>(event, path) }
    catch (failure: any) {
      const status = failure?.statusCode ?? failure?.status
      if (status === 401 || status === 429) throw failure
      result.warnings.push(`${label}: ${failure?.data?.message || 'недоступно'}`)
      return null
    }
  }
  const [projects, workspace, personal, board] = await Promise.all([
    optional<Project[]>('/api/projects', 'Проекты'),
    optional<{ groups: SharedVault[]; cards: SharedCard[] }>('/api/workspace', 'Хранилища'),
    optional<{ data?: VaultData }>('/api/personal-vault', 'Личное хранилище'),
    optional<KabanWorkspace>(`/api/kaban?vault=${encodeURIComponent(selected.vaultId || 'personal')}`, 'Кабан')
  ])
  result.projects = (projects || []).map(({ id, name, permission }) => ({ id, name, permission }))
  result.vaults = [{ id: 'personal', name: personal?.data?.name || 'Личное', canEdit: true }, ...(workspace?.groups || []).map(({ id, name, canEdit }) => ({ id, name, canEdit: canEdit !== false }))]
  result.kaban = board
  if (board) for (const task of board.tasks.filter(task => task.canEdit && !task.archived)) {
    const blocks = task.blocks?.filter(block => block.type === 'files') || []
    if (blocks.length) for (const block of blocks) result.uploadTargets.push({ id: `task:${task.id}:${block.id}`, kind: 'task', recordId: task.id, blockId: block.id, label: `Кабан · ${task.title} · ${block.title}` })
    else result.uploadTargets.push({ id: `task:${task.id}`, kind: 'task', recordId: task.id, label: `Кабан · ${task.title}` })
  }
  const sources = projectSharedCards([{ id: 'personal', name: personal?.data?.name || 'Личное', data: personal?.data || { version: 1, entries: [], categories: [] } }, ...(workspace?.groups || []).map(group => ({ id: group.id, name: group.name, data: group.data }))], workspace?.cards || [])
  const entries = sourceEntries(sources, true)
  result.relations = assistantRelations(entries)
  const project = result.projects.find(project => project.id === selected.projectId)
  if (selected.projectId && !project) throw createError({ statusCode: 403, message: 'Проект недоступен.' })
  if (project) {
    result.project = project
    const [estimate, inputs, process] = await Promise.all([
      optional<ProjectEstimate>(`/api/projects/${project.id}/estimate`, 'Смета'),
      optional<ProjectInputs>(`/api/projects/${project.id}/input-data`, 'Входные данные'),
      optional<ProjectProcess>(`/api/projects/${project.id}/process-map`, 'Ход проекта')
    ])
    const amounts = estimate ? estimateAmounts(estimate.items) : []
    const financials = estimate ? estimateFinancials(estimate) : undefined
    result.projectData = {
      project: projects?.find(item => item.id === project.id),
      summary: { projectId: project.id, financials, finishDate: estimate?.details.finishDate, itemCount: estimate?.items.length },
      estimate: estimate ? { ...estimate, items: estimate.items.map(({ image: _image, ...item }, index) => ({ ...item, ...amounts[index] })) } : null,
      contracts: process?.contracts,
      inputs: inputs?.cards.map(card => ({ title: card.title, description: card.description, fields: card.fields, attachments: card.attachments.map(file => ({ name: file.name, size: file.size })) })),
      progress: process ? { today: process.today, stages: process.stages, contracts: process.contracts.map(contract => ({ id: contract.id, number: contract.number, deadline: contract.deadline, done: contract.done, total: contract.total, status: contract.status })) } : null
    }
    if (project.permission !== 'viewer') {
      for (const contract of process?.contracts || []) result.uploadTargets.push({ id: `contract:${contract.id}`, kind: 'contract', projectId: project.id, recordId: contract.id, label: `${project.name} · Договор ${contract.number || contract.code}` })
      for (const card of inputs?.cards || []) result.uploadTargets.push({ id: `input:${card.id}`, kind: 'input', projectId: project.id, recordId: card.id, revision: inputs!.revision, label: `${project.name} · Входные данные · ${card.title}` })
    }
  }
  return result
}
