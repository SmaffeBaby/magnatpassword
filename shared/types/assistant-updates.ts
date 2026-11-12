export interface AssistantUpdate { id: string; title: string; body: string; date: string; kind: 'feature' | 'fix' }
export interface AssistantUpdates { revision: number; posts: AssistantUpdate[] }
