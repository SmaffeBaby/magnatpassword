import { getAppRelease, releaseDownloadPath } from '../../utils/releases'
export default defineEventHandler(async () => {
  const { data } = await getAppRelease()
  return { version: data.version, notes: data.notes, publishedAt: data.publishedAt,
    downloads: data.downloads.map(item => ({ ...item, url: releaseDownloadPath(data.version, item.asset) })) }
})
