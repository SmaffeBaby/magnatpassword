export interface ProjectContractInput { noDeadline?: boolean; autoRenew?: boolean;
  fields?: import('./contract-fields').ContractField[]
  registryRef?: import('./contract-fields').RegistryReference | null
  code: string; number: string; sellerId: string; buyerId: string; date: string; deadline: string
  source: 'revenue' | 'expenses'; itemIds: string[]
}
export interface StoredProjectContract extends ProjectContractInput { id: string; revision: number; fileCount?: number }
export interface ProjectContract extends StoredProjectContract {
  seller: string; buyer: string; amount: number | null; vatAmount: number | null; netAmount: number | null; issue: string
}
export interface ProjectContractRegistry { contracts: ProjectContract[]; estimateRevision: number }
