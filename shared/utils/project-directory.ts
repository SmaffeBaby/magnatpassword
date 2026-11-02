import type { Project, ProjectFinancialSummary } from '../types/projects'

export type ProjectSort = 'updated' | 'created' | 'name' | 'revenue' | 'cost' | 'profit' | 'profit-asc'
export interface ProjectFilters {
  search: string; permission: string; members: string[]; allMembers: boolean
  finance: 'all' | 'with-estimate' | 'without-estimate' | 'positive' | 'negative'
  sort: ProjectSort
}
export const projectMembers = (project: Project) => project.members.filter(member => member.permission !== 'hidden')
const normalize = (value: string) => value.toLocaleLowerCase('ru').replace(/ё/g, 'е')
export function directoryUpdatedAt(project: Project, summary?: ProjectFinancialSummary) {
  return summary?.updatedAt && Date.parse(summary.updatedAt) > Date.parse(project.updatedAt) ? summary.updatedAt : project.updatedAt
}
export function filterProjectDirectory(projects: Project[], summaries: Map<string, ProjectFinancialSummary>, filters: ProjectFilters) {
  const terms = normalize(filters.search).trim().split(/\s+/).filter(Boolean)
  return projects.filter(project => {
    const summary = summaries.get(project.id), members = projectMembers(project)
    if (filters.permission !== 'all' && project.permission !== filters.permission) return false
    if (filters.members.length) {
      const includes = (id: string) => members.some(member => member.userId === id)
      if (!(filters.allMembers ? filters.members.every(includes) : filters.members.some(includes))) return false
    }
    const text = normalize([project.name, summary?.title, summary?.code, ...members.flatMap(member => [member.fullName, member.email])].join(' '))
    if (!terms.every(term => text.includes(term))) return false
    if (filters.finance === 'with-estimate' && summary?.status !== 'ready') return false
    if (filters.finance === 'without-estimate' && summary?.status !== 'empty') return false
    if (filters.finance === 'positive' && !(summary?.status === 'ready' && (summary.financials?.profit ?? 0) > 0)) return false
    if (filters.finance === 'negative' && !(summary?.status === 'ready' && (summary.financials?.profit ?? 0) < 0)) return false
    return true
  }).sort((a, b) => {
    let order = 0
    if (filters.sort === 'name') order = a.name.localeCompare(b.name, 'ru', { numeric: true })
    else if (filters.sort === 'created') order = Date.parse(b.createdAt) - Date.parse(a.createdAt)
    else if (filters.sort === 'updated') order = Date.parse(directoryUpdatedAt(b, summaries.get(b.id))) - Date.parse(directoryUpdatedAt(a, summaries.get(a.id)))
    else {
      const sa = summaries.get(a.id), sb = summaries.get(b.id)
      const fa = sa?.status === 'ready' ? sa.financials : undefined, fb = sb?.status === 'ready' ? sb.financials : undefined
      if (!fa || !fb) order = Number(!!fb) - Number(!!fa)
      else {
        const field = filters.sort === 'profit-asc' ? 'profit' : filters.sort
        order = filters.sort === 'profit-asc' ? fa[field] - fb[field] : fb[field] - fa[field]
      }
    }
    return order || a.name.localeCompare(b.name, 'ru', { numeric: true }) || a.id.localeCompare(b.id)
  })
}
