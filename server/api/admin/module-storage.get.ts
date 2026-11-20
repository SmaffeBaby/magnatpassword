import { moduleStorageSchema, type AdminModuleStorage } from '~~/shared/types/admin-module-storage'
import { getReleaseAssetBytes } from '../../utils/releases'

export default defineEventHandler(async (event): Promise<AdminModuleStorage> => {
  const { client } = await requireSiteAdmin(event)
  const [result, releaseBytes] = await Promise.all([
    client.rpc('admin_module_storage'),
    getReleaseAssetBytes().catch(() => null),
  ])

  return { modules: moduleStorageSchema.safeParse(result.data).data ?? null, releaseBytes }
})
