import type { KabanWorkspace, KabanStage } from '../types/kaban'
export function kabanCategoryStages(workspace: KabanWorkspace | null | undefined, categoryId?: string | null): KabanStage[] {
  if (!workspace) return []
  const seen = new Set<string>()
  let category = workspace.categories.find(c => c.id === categoryId)
  while (category && !seen.has(category.id)) {
    if (category.effectiveStages) return category.effectiveStages
    if (category.stages) return category.stages
    seen.add(category.id)
    category = workspace.categories.find(c => c.id === category!.parentId)
  }
  return workspace.board.defaultStages || workspace.board.stages
}
export function kabanTaskStage(task: { stageId: string; categoryStageIds?: Record<string, string> }, categoryId?: string | null): string {
  return categoryId && task.categoryStageIds?.[categoryId] || task.stageId
}

export function kabanTaskScope(workspace: KabanWorkspace | null | undefined, categoryIds: string[], selected?: string): string | undefined {
  if (selected && categoryIds.includes(selected)) return selected
  return selected ? categoryIds.find(id => workspace?.categories.some(c => c.id === id && c.parentId === selected)) || categoryIds.find(id => workspace?.categories.some(c => c.id === id)) || categoryIds[0] : categoryIds.find(id => workspace?.categories.some(c => c.id === id)) || categoryIds[0]
}
