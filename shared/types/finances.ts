import type { ScopedCredential } from '../utils/vault-sources'

export interface FinanceSegment {
  key: string
  label: string
  amount: number
  entry?: ScopedCredential
}
export interface FinanceMonth {
  key: string
  label: string
  planned: number
  paid: number
  plannedSegments: FinanceSegment[]
  paidSegments: FinanceSegment[]
}
