export type Currency = 'USD' | 'EUR' | 'RUB' | 'CNY'
export interface ReminderRules { leadDays: number[]; repeatEveryDays: number; customDates: string[] }
export interface SubscriptionCard { vaultId: string; entryId: string; sharedCardId?: string }
export interface Subscription { primaryCard?: SubscriptionCard; linkedCards?: SubscriptionCard[]; price: number; currency: Currency; periodCount: number; periodUnit: 'day' | 'month' | 'year'; startsOn: string; paidFrom?: string; paidUntil: string; autoRenew: boolean; reminders?: ReminderRules }
export interface NotificationSettings extends ReminderRules { sharedChanges: boolean; subscriptions: boolean }
export interface AppNotification { id: string; kind: 'shared' | 'subscription'; title: string; message: string; createdAt: string; readAt: string | null; vaultId: string | null; entryId: string | null; fieldId: string | null }

export interface SubscriptionPayment { sharedCardId?:string; id:string; entryId:string; fieldId:string; service:string; label:string; amount:number; currency:Currency; paidAt:string; periodFrom:string; periodUntil:string }
