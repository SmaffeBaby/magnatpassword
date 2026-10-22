import type { VaultData } from './vault'
export interface SharedMember { userId: string; email: string; brand: 'magnat' | 'light' }
export interface SharedVault { id: string; name: string; ownerId: string; revision: number; members: SharedMember[]; data: VaultData }
export interface VaultSource { id: string; name: string; data: VaultData }
