import type { H3Event } from 'h3'
import { dashboardLayoutSchema, defaultDashboard, type DashboardLayout, type ProjectDashboard } from '../../shared/utils/project-dashboard'

export async function projectDashboard(event: H3Event, write?: DashboardLayout & { revision: number }): Promise<ProjectDashboard> {
  const context = await requireProjectsUser(event), id = projectId(event)
  const { data, error } = await context.client.rpc('project_dashboard', {
    p_actor: context.user.id, p_id: id, p_revision: write?.revision ?? null,
    p_layout: write ? { blocks: write.blocks } : null
  })
  if (error) projectFailure(error)
  return { revision: data.revision, ...(data.layout ? dashboardLayoutSchema.parse(data.layout) : defaultDashboard()) }
}
