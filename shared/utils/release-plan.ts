import { z } from 'zod'
export const releasePlanSchema = z.object({
  version: z.string().trim().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Укажите версию в формате 1.2.3'),
  notes: z.string().trim().min(1, 'Опишите изменения').max(30000)
}).strict()
export type ReleasePlan = z.infer<typeof releasePlanSchema>
