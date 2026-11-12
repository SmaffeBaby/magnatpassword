import type { KabanBoard, KabanCategory } from '../../shared/types/kaban'
// The catalog is shared internally for stage validation and history. Expose only definitions
// reachable through categories visible to this caller, and use their placement in the task list.
export function scopeKabanStages(data: { board: KabanBoard; categories: KabanCategory[]; tasks: { category_ids: string[]; category_stage_ids?: Record<string, string>; stage_id: string }[] }) {
  if (!data.board.defaultStages) return
  const categories = new Set(data.categories.map(c => c.id))
  const stages = new Set([...data.board.defaultStages, ...data.categories.flatMap(c => c.effectiveStages || c.stages || [])].map(s => s.id))
  data.board.stages = data.board.stages.filter(s => stages.has(s.id))
  for (const task of data.tasks) {
    const placements = Object.fromEntries(Object.entries(task.category_stage_ids || {}).filter(([id]) => categories.has(id)))
    const category = task.category_ids.find(id => placements[id])
    if (category) task.stage_id = placements[category]!
    task.category_stage_ids = placements
  }
}
