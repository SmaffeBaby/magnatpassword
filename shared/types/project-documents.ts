import type { ProjectPermission } from './projects'
export interface ProjectDocumentMetadata { name: string; type: string; size: number; description: string; tags: string[] }
export interface ProjectDocument extends ProjectDocumentMetadata {
  folderId: string | null
  id: string; revision: number; createdAt: string; updatedAt: string; createdBy: string | null
  permission: 'owner' | 'viewer' | 'editor'; canManage: boolean
  defaultPermission?: ProjectPermission | 'inherit' | null
  members?: { userId: string; permission: ProjectPermission }[] | null
}
export interface ProjectDocumentFolder { id: string; parentId: string | null; name: string; revision: number }
