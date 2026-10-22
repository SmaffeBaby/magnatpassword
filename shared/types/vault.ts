import type { Subscription } from './subscriptions'
export interface Category { id: string; name: string; icon: string; color: string }
export interface CustomField { id: string; label: string; value: string; type: 'text' | 'secret' | 'url' | 'subscription'; subscription?: Subscription }
export interface CredentialLink { id: string; targetVaultId: string; targetEntryId: string; sourceFieldId?: string; targetFieldId?: string; label?: string }
export interface Credential { customFields?: CustomField[]; links?: CredentialLink[]; id: string; title: string; url: string; username: string; password: string; notes: string; categoryId: string; favorite: boolean; createdAt: string; updatedAt: string }
export interface VaultData { name?: string; version: 1; categories: Category[]; entries: Credential[] }
export interface EncryptedData { version: 1; iv: string; ciphertext: string }
