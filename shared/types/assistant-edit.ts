export interface AssistantEdit { kind: 'credential' | 'project' | 'relation'; target: string; field: string; value: string }
export interface AssistantEditTarget { id: string; label: string; revision: number; fields: { id: string; label: string; value: string; secret?: boolean }[] }
