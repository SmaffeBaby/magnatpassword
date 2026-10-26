import type { VaultRole } from './team'
import type { VaultData } from './vault'
export interface SharedMember { role?:VaultRole; fullName?:string; categoryIds?:string[]|null; userId: string; email: string; brand: 'magnat' | 'light' }
export interface SharedVault { role?:VaultRole; canEdit?:boolean; canManageMembers?:boolean; categoryIds?:string[]|null; canManageStructure?:boolean; id: string; name: string; ownerId: string; revision: number; members: SharedMember[]; data: VaultData }
export interface VaultSource { id: string; name: string; data: VaultData }

export interface SharedCard { canEdit?:boolean; canManageCategories?:boolean; archived?:boolean; id:string; revision:number; ownerId:string; vaultIds:string[]; canManageSharing:boolean; entry:import('./vault').Credential; payments:import('./subscriptions').SubscriptionPayment[] }
