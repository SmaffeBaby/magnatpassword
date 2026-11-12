export interface AssistantKabanDraft {
  operation: 'create_category' | 'edit_category' | 'edit_stages'
  parentName?: string
  stageOperation?: 'add' | 'edit' | 'remove'
  categoryName: string
  name: string
  stageName: string
  color?: string
}
