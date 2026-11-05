import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { getAppRelease, getReleaseRoot } from '../../../../utils/releases'
export default defineEventHandler(async event => {
  const version = getRouterParam(event, 'version') || ''
  const name = getRouterParam(event, 'asset') || ''
  const { data } = await getAppRelease(version)
  const allowed = [...data.downloads.map(item => item.asset), ...Object.values(data.updates).map(item => item.asset)]
  if (!allowed.includes(name)) throw createError({ statusCode: 404 })
  const root = await getReleaseRoot()
  let path: string
  let size: number
  try {
    path = await realpath(resolve(root, version, name))
    if (!path.startsWith(root + sep)) throw new Error('Invalid asset')
    const info = await stat(path)
    if (!info.isFile()) throw new Error('Invalid asset')
    size = info.size
  } catch { throw createError({ statusCode: 404 }) }
  setResponseHeaders(event, {
    'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"`,
    'X-Content-Type-Options': 'nosniff', 'Content-Length': String(size)
  })
  return sendStream(event, createReadStream(path))
})
