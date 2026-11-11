import type { Project } from './projects'
import type { ProjectEstimate, EstimateItem } from './estimate'
import type { ProjectInputs } from './project-inputs'
import type { ProjectProcess } from './project-process'
import type { TeamDirectory, TeamUnit } from './team'
export type ProjectReadTopic = 'overview' | 'estimate' | 'finance' | 'members' | 'companies' | 'contracts' | 'inputs' | 'execution' | 'closing' | 'relationships'
export interface AssistantEstimate extends Omit<ProjectEstimate, 'items'> { items: (Omit<EstimateItem, 'image'> & { total: number; vat: number; net: number; counterparty: string })[] }
export interface AssistantProjectSnapshot {
  project: Project
  estimate?: AssistantEstimate | null
  inputs?: ProjectInputs | null
  process?: ProjectProcess | null
  contractFiles?: { contract: string; files: { name: string; size: number }[] }[]
  financials?: Omit<ProjectProcess['estimate'], 'itemCount' | 'fields'>
  documents?: { title: string; text: string }[]
  warnings: string[]
}
export interface AssistantTeamSnapshot extends TeamDirectory { units: TeamUnit[]; label: string }
