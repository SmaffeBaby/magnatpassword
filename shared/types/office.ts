export interface OfficeSource { kind: 'document'|'input'|'task'|'contract'|'registry'; projectId?: string; recordId?: string; fileId: string }
export interface OfficeFile { source: OfficeSource; name: string; size: number; type: string; token: string; canEdit: boolean }
export interface OfficeTarget { kind: OfficeSource['kind']; projectId?: string; recordId?: string; folderId?: string | null; revision?: number; label: string }
