import { z } from 'zod'

export const measuredModuleIds = [
  'kaban', 'passwords', 'finances', 'relationships', 'team',
  'projects', 'contracts', 'spaces', 'chat', 'sharedVaults',
] as const

export const moduleStorageSchema = z.record(z.enum(measuredModuleIds), z.object({
  databaseBytes: z.number().int().nonnegative(),
  fileBytes: z.number().int().nonnegative(),
}))

export type AdminModuleStorage = {
  modules: z.infer<typeof moduleStorageSchema> | null
  releaseBytes: number | null
}
