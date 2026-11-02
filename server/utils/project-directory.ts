import type { H3Event } from 'h3'
import type { Project, ProjectFinancialSummary } from '../../shared/types/projects'
import { normalizeEstimate, estimateFinancials } from '../../shared/utils/estimate'
import { openSharedVault } from './shared-crypto'

// Keep only small summaries in memory. Permission checks still run on every request.
const summaries = new Map<string, { revision: number; summary: ProjectFinancialSummary }>()
export async function projectDirectorySummaries(event: H3Event) {
  const context = await requireProjectsUser(event)
  const projects = await context.client.rpc('list_projects', { p_actor: context.user.id })
  if (projects.error) throw createError({ statusCode: 503, message: 'Не удалось проверить доступ к проектам' })
  const ids = ((projects.data ?? []) as Project[]).map(project => project.id)
  const result = new Map<string, ProjectFinancialSummary>(ids.map(projectId => [projectId, { projectId, status: 'empty', updatedAt: null }]))
  const pending: string[] = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await context.client.from('project_estimates').select('project_id,revision,updated_at').in('project_id', ids.slice(offset, offset + 100))
    if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить показатели проектов' })
    for (const row of data ?? []) {
      const cached = summaries.get(row.project_id)
      if (cached && cached.revision === row.revision && cached.summary.updatedAt === row.updated_at) result.set(row.project_id, cached.summary)
      else pending.push(row.project_id)
    }
  }
  // Estimates contain images, so fetch a small batch and return only financial data.
  for (let offset = 0; offset < pending.length; offset += 5) {
    const { data, error } = await context.client.from('project_estimates').select('project_id,revision,updated_at,encrypted_data').in('project_id', pending.slice(offset, offset + 5))
    if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить показатели проектов' })
    for (const row of data ?? []) {
      try {
        const estimate = normalizeEstimate(openSharedVault(row.encrypted_data, sharedSecret(event), `project-estimate:${row.project_id}`, 1))
        const financials = estimateFinancials(estimate)
        const summary: ProjectFinancialSummary = {
          projectId: row.project_id, status: estimate.items.length || financials.revenue ? 'ready' : 'empty', updatedAt: row.updated_at,
          title: estimate.details.title, code: estimate.details.code, finishDate: estimate.details.finishDate, itemCount: estimate.items.length,
          financials: { cost: financials.cost, revenue: financials.revenue, profit: financials.profit, profitability: financials.profitability }
        }
        result.set(row.project_id, summary)
        summaries.delete(row.project_id)
        summaries.set(row.project_id, { revision: row.revision, summary })
        if (summaries.size > 256) summaries.delete(summaries.keys().next().value!)
      } catch {
        result.set(row.project_id, { projectId: row.project_id, status: 'error', updatedAt: row.updated_at })
      }
    }
  }
  return [...result.values()]
}
