import type { ProjectCounterparty } from './estimate'
export interface DirectoryCompany extends ProjectCounterparty {
  ownerId: string | null; revision: number; canEdit: boolean; projectCount: number; isOwnLegalEntity: boolean
}
