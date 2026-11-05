import { readFile, realpath, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { z } from 'zod'
const filename = z.string().regex(/^Magnat-[\w.-]+\.(exe|dmg|apk|ipa|app\.tar\.gz)$/)
const schema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/), notes: z.string().min(1).max(30000), publishedAt: z.string().datetime(),
  downloads: z.array(z.object({ platform: z.enum(['windows', 'macos', 'android', 'ios']), label: z.string(), asset: filename, signingExpiresAt: z.string().datetime().optional() })),
  updates: z.record(z.string(), z.object({ asset: filename, signature: z.string().min(1) }))
})
export async function getReleaseRoot() {
  const root = useRuntimeConfig().releasesDirectory
  if (!root) throw createError({ statusCode: 503, statusMessage: 'Release SSD is not configured' })
  try { return await realpath(root) } catch { throw createError({ statusCode: 503, statusMessage: 'Release SSD unavailable' }) }
}
export async function getAppRelease(version?: string) {
  const root = await getReleaseRoot()
  if (!version) {
    try { version = JSON.parse(await readFile(resolve(root, 'latest.json'), 'utf8')).version }
    catch { throw createError({ statusCode: 404, statusMessage: 'No published release' }) }
  }
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw createError({ statusCode: 404 })
  try {
    const path = resolve(root, version, 'release.json')
    if (!(await realpath(path)).startsWith(root + sep) || (await stat(path)).size > 100000) throw new Error('Invalid metadata')
    const data = schema.parse(JSON.parse(await readFile(path, 'utf8')))
    if (version !== data.version) throw new Error('Version mismatch')
    return { data }
  } catch { throw createError({ statusCode: 404, statusMessage: 'Release unavailable' }) }
}
export function releaseDownloadPath(version: string, asset: string) {
  return `/api/releases/files/${encodeURIComponent(version)}/${encodeURIComponent(asset)}`
}
