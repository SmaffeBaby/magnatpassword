export interface Category { id: string; name: string; icon: string; color: string }
export interface Credential { id: string; title: string; url: string; username: string; password: string; notes: string; categoryId: string; favorite: boolean; createdAt: string; updatedAt: string }
export interface VaultData { version: 1; categories: Category[]; entries: Credential[] }
export interface EncryptedData { version: 1; iv: string; ciphertext: string }
