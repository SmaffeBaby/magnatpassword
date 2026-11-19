import type { ProjectProfile } from '../utils/project-workspace'
import type { ProjectSectionPermissions } from '../utils/project-permissions'
export type ProjectPermission = 'viewer' | 'editor' | 'hidden'
export interface ProjectRole {
  id: string
  name: string
  permission: ProjectPermission
  sections: ProjectSectionPermissions
}
export interface ProjectMember {
  userId: string
  fullName: string
  email: string
  permission: ProjectPermission | 'owner'
  kind?: 'executor' | 'observer'
  roleIds?: string[]
  projectRoleId?: string | null
  hasAccess: boolean
  sections?: ProjectSectionPermissions
}
export interface Project {
  id: string
  name: string
  profile?: Partial<ProjectProfile>
  folderId?: string | null
  favorite?: boolean
  taskCount?: number | null
  ownerId: string
  permission: 'owner' | 'viewer' | 'editor'
  sectionPermissions?: ProjectSectionPermissions
  revision: number
  createdAt: string
  updatedAt: string
  members: ProjectMember[]
  roles?: ProjectRole[]
  canManageMembers?: boolean
}
export interface ProjectAccessUser { id: string; fullName: string; email: string; grantedAt: string }
export interface ProjectFinancialSummary {
  projectId: string
  status: 'ready' | 'empty' | 'error'
  updatedAt: string | null
  title?: string
  code?: string
  finishDate?: string
  itemCount?: number
  financials?: { cost: number; revenue: number; profit: number; profitability: number | null }
}
