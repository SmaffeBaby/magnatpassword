export type EstimateCurrency = 'RUB'
export type EstimateFieldType = 'text' | 'link' | 'money' | 'date' | 'number'
export interface EstimateField { id: string; label: string; type: EstimateFieldType; value: string; currency: EstimateCurrency }
export interface EstimateItem {
  id: string; kind: 'product' | 'service'; name: string; image: string; link: string
  quantity: number; price: number; currency: EstimateCurrency; deadline: string; fields: EstimateField[]
  unit: string; counterpartyId: string; internalCost: boolean; vatRate: number; vatGroup: string
}
export interface ProjectCounterparty { id: string; company: string; inn: string; kpp: string; director: string; address: string; bankAccount: string }
export interface EstimateDetails {
  title: string; code: string; description: string; batchQuantity: number; clientUnitPrice: number; finishDate: string; revenueVatRate: number
  notice: string; notes: string[]; counterpartyNote: string
}
export interface EstimateContent { items: EstimateItem[]; details: EstimateDetails; counterparties: ProjectCounterparty[] }
export interface ProjectEstimate extends EstimateContent { revision: number; updatedAt: string | null }
export interface EstimateView { hiddenRows: string[]; hiddenColumns: string[] }
