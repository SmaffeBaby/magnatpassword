import { z } from 'zod'
import type { Project, ProjectPermission } from '../types/projects'

export const projectSections = [
  { key: 'economy', label: 'Экономика проекта' },
  { key: 'tasks', label: 'Задачи · Кабан' }
] as const
export type ProjectSection = typeof projectSections[number]['key']
export const projectSectionPermissionsSchema = z.object({
  economy: z.enum(['hidden', 'viewer', 'editor']).optional(),
  tasks: z.enum(['hidden', 'viewer', 'editor']).optional()
}).strict()
export type ProjectSectionPermissions = z.infer<typeof projectSectionPermissionsSchema>

export function projectSectionPermission(project: Pick<Project, 'permission' | 'sectionPermissions'>, section: ProjectSection): ProjectPermission | 'owner' {
  if (project.permission === 'owner') return 'owner'
  return project.sectionPermissions?.[section] ?? project.permission
}
export function canViewProjectSection(project: Pick<Project, 'permission' | 'sectionPermissions'>, section: ProjectSection) {
  return projectSectionPermission(project, section) !== 'hidden'
}
export function canEditProjectSection(project: Pick<Project, 'permission' | 'sectionPermissions'>, section: ProjectSection) {
  return ['owner', 'editor'].includes(projectSectionPermission(project, section))
}
