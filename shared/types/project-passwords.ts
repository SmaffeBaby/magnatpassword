import type { Credential } from './vault'
export interface ProjectPasswordSource {
  kind: 'personal' | 'vault' | 'card'
  sourceId: string
  entryId: string
}
export interface ProjectPasswordCandidate {
  source: ProjectPasswordSource
  sourceName: string
  entry: Credential
}
export interface ProjectPassword {
  id: string
  revision: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
  canEdit: boolean
  entry: Credential
}
export interface ProjectPasswordChoice {
  source: ProjectPasswordSource
  sourceName: string
  title: string
  username: string
}
