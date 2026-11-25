import { moduleStorageSchema, type AdminModuleStorage } from '~~/shared/types/admin-module-storage'
import { getReleaseAssetStorage } from '../../utils/releases'

export default defineEventHandler(async (event): Promise<AdminModuleStorage> => {
  const { client } = await requireSiteAdmin(event)
  const [result, releases] = await Promise.all([
    client.rpc('admin_module_storage'),
    getReleaseAssetStorage().catch(() => null),
  ])

  return {
    modules: moduleStorageSchema.safeParse(result.data).data ?? null,
    releaseBytes: releases?.bytes ?? null,
    releasePlatformBytes: releases?.platformBytes ?? null,
  }
})
