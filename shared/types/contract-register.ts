import type { ContractFile } from './project-contract-files'
export interface RegisterFile extends ContractFile { origin:'project'|'standalone'; contractId:string; projectId?:string }
export interface StandaloneContractInput { noDeadline?: boolean; autoRenew?: boolean; sellerCatalogId?: string; buyerCatalogId?: string; fields?:import('./contract-fields').ContractField[]; code: string; number: string; seller: string; buyer: string; date: string; deadline: string; amount: number | null; vatAmount: number | null; notes: string }
export interface RegisterContract extends StandaloneContractInput {
  registryRef?: import('./contract-fields').RegistryReference | null
  id: string; origin: 'project' | 'standalone'; projectId: string | null; projectName: string; source: 'revenue' | 'expenses' | 'manual'; revision: number; canEdit: boolean; canOpenProject: boolean; fileCount: number; issue: string; updatedAt: string
}
export interface ContractRegisterResult { contracts: RegisterContract[]; total: number; page: number; pageSize: number; pages: number; projects: { id: string; name: string }[] }
export interface RegisterContractDetail { contract: RegisterContract; files: RegisterFile[] }
