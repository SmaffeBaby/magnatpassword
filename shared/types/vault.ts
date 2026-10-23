import type { Subscription, SubscriptionPayment } from './subscriptions'
export interface CredentialAccount { id:string; label:string; username:string; password:string }
export interface CardImage { id:string; name:string; data:string }
export interface CategoryReference { vaultId:string; categoryId:string }
export interface CategoryFolder { categoryLinks?:CategoryReference[]; id:string; name:string; icon:string; color:string; svg?:string }
export interface Category { folderId?:string; svg?:string; id: string; name: string; icon: string; color: string }
export interface CustomField { id: string; label: string; value: string; type: 'text' | 'secret' | 'url' | 'subscription'; subscription?: Subscription }
export interface CredentialLink { id: string; targetVaultId: string; targetEntryId: string; sourceFieldId?: string; targetFieldId?: string; label?: string }
export interface Credential { accounts?:CredentialAccount[]; categoryIds?:string[]; images?:CardImage[]; sharedCardId?:string; customFields?: CustomField[]; links?: CredentialLink[]; id: string; title: string; url: string; username: string; password: string; notes: string; categoryId: string; favorite: boolean; createdAt: string; updatedAt: string }
export interface VaultData { categoryFolders?:CategoryFolder[]; svg?:string; subscriptionPayments?: SubscriptionPayment[]; name?: string; version: 1; categories: Category[]; entries: Credential[] }
export interface EncryptedData { version: 1; iv: string; ciphertext: string }
