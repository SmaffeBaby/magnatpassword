export type ProjectPermission = 'viewer' | 'editor' | 'hidden'
export interface ProjectMember {
  userId: string
  fullName: string
  email: string
  permission: ProjectPermission | 'owner'
  hasAccess: boolean
}
export interface Project {
  id: string
  name: string
  ownerId: string
  permission: 'owner' | 'viewer' | 'editor'
  revision: number
  createdAt: string
  updatedAt: string
  members: ProjectMember[]
}
export interface ProjectAccessUser { id: string; fullName: string; email: string; grantedAt: string }
