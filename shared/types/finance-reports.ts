import type { Currency } from './subscriptions'

export interface FinanceReportRequest {
  title: string
  from: string
  to: string
  vaultIds: string[]
  currency: Currency | 'all'
  search: string
}
export interface FinanceReportSummary {
  id: string
  title: string
  from: string
  to: string
  createdAt: string
  vaultNames: string[]
  currency: Currency | 'all'
  search: string
  paymentCount: number
  serviceCount: number
  totals: { currency: Currency; amount: number }[]
  filename: string
}
