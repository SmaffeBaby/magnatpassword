export type TeamUnitKind = 'company' | 'department' | 'role'
export type VaultRole = 'viewer' | 'member' | 'manager'
export interface TeamUnit { id: string; parentId: string | null; name: string; kind: TeamUnitKind; brand: 'light' | 'magnat' | null }
export interface TeamPerson { isHidden?: boolean; id: string; fullName: string; email: string; workEmail: string; telegram: string; brand: 'light' | 'magnat'; avatarUrl: string; roleIds: string[]; commonVaultCount?: number }
export interface TeamDirectory { people: TeamPerson[]; units: TeamUnit[]; total: number; page: number }
export interface ProfileWorkState { status: string | null; workload: number | null; mood: number | null }
export interface TeamProfile { person: TeamPerson; workState: ProfileWorkState; units: TeamUnit[]; commonUnits: string[]; commonVaults: { id: string; name: string; role: VaultRole; owner: boolean; svg?:string }[] }
export interface TeamProfileOverview {
  lastSeenAt: string | null
  online: boolean
  projects: { id: string | null; name: string }[]
}
