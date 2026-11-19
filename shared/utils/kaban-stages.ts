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

export function kabanProjectStages(
  workspace: KabanWorkspace,
  tasks: readonly { stageId: string }[],
  selectedCategory?: string
): KabanStage[] {
  const categories = workspace.categories.filter(category => !category.archived)
  const selected = categories.find(category => category.id === selectedCategory)
  const configured = selected
    ? kabanCategoryStages(workspace, selected.id)
    : categories.length
      ? categories.flatMap(category => kabanCategoryStages(workspace, category.id))
      : kabanCategoryStages(workspace)
  const taskStageIds = new Set(tasks.map(task => task.stageId))
  const stages = new Map(configured.map(stage => [stage.id, stage]))
  // Keep stages for older placements that still have cards on this view.
  for (const stage of workspace.board.stages) {
    if (taskStageIds.has(stage.id) && !stages.has(stage.id)) stages.set(stage.id, stage)
  }
  return [...stages.values()]
}

export function kabanProjectPlanningStages(workspace: KabanWorkspace): KabanStage[] {
  const tasks = workspace.tasks.filter(task => !task.archived)
  if (!tasks.length && workspace.categories.every(category => category.archived)) return []
  return kabanProjectStages(workspace, tasks)
}

export function kabanTaskScope(workspace: KabanWorkspace | null | undefined, categoryIds: string[], selected?: string): string | undefined {
  if (selected && categoryIds.includes(selected)) return selected
  return selected ? categoryIds.find(id => workspace?.categories.some(c => c.id === id && c.parentId === selected)) || categoryIds.find(id => workspace?.categories.some(c => c.id === id)) || categoryIds[0] : categoryIds.find(id => workspace?.categories.some(c => c.id === id)) || categoryIds[0]
}
