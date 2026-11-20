import { readFile, statfs } from 'node:fs/promises'
import { dockerMetricsSchema, type AdminMetrics } from '~~/shared/types/admin-metrics'

async function readDockerMetrics() {
  try {
    const snapshot = dockerMetricsSchema.parse(JSON.parse(await readFile('/metrics/snapshot.json', 'utf8')))
    if (Date.now() - Date.parse(snapshot.sampledAt) > 60_000) return null
    if (snapshot.servicesSampledAt && Date.now() - Date.parse(snapshot.servicesSampledAt) > 300_000) {
      return { ...snapshot, services: null, servicesSampledAt: null }
    }
    return snapshot
  } catch {
    return null
  }
}

async function readReleasesDisk() {
  try {
    const disk = await statfs('/releases')
    return { totalBytes: disk.blocks * disk.bsize, availableBytes: disk.bavail * disk.bsize }
  } catch {
    return null
  }
}

export default defineEventHandler(async (event): Promise<AdminMetrics> => {
  const { client } = await requireSiteAdmin(event)
  const [presence, docker, releasesDisk] = await Promise.all([
    client.rpc('admin_online_users'),
    readDockerMetrics(),
    readReleasesDisk(),
  ])
  return {
    onlineUsers: typeof presence.data === 'number' ? presence.data : null,
    docker,
    releasesDisk,
  }
})
