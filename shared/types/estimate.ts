export type EstimateCurrency = 'RUB'
export type EstimateFieldType = 'text' | 'link' | 'money' | 'date' | 'number'
export interface EstimateField { id: string; label: string; type: EstimateFieldType; value: string; currency: EstimateCurrency }
export interface EstimateItem {
  id: string; kind: 'product' | 'service'; name: string; image: string; link: string
  quantity: number; price: number; currency: EstimateCurrency; deadline: string; fields: EstimateField[]
}
export interface ProjectEstimate { revision: number; items: EstimateItem[]; updatedAt: string | null }
export interface EstimateView { hiddenRows: string[]; hiddenColumns: string[] }
