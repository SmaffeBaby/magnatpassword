import { readFile, rename, statfs, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { loadavg } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'

const metricsFile = '/metrics/snapshot.json'
const project = process.env.METRICS_COMPOSE_PROJECT || 'magnat-password'
let services = null
let servicesSampledAt = null
let storage = null
let storageSampledAt = null

async function readCpu() {
  const stat = await readFile('/proc/stat', 'utf8')
  const ticks = stat.split('\n', 1)[0].trim().split(/\s+/).slice(1, 9).map(Number)
  return { total: ticks.reduce((sum, value) => sum + value, 0), idle: ticks[3] + ticks[4] }
}

async function collectHost(previousCpu) {
  const [cpu, meminfo, disk] = await Promise.all([
    readCpu(), readFile('/proc/meminfo', 'utf8'), statfs('/metrics'),
  ])
  const totalTicks = cpu.total - previousCpu.total
  const busyTicks = totalTicks - (cpu.idle - previousCpu.idle)
  const memoryTotal = Number(meminfo.match(/^MemTotal:\s+(\d+)/m)?.[1]) * 1024
  const memoryAvailable = Number(meminfo.match(/^MemAvailable:\s+(\d+)/m)?.[1]) * 1024
  if (!Number.isFinite(memoryTotal) || !Number.isFinite(memoryAvailable)) throw new Error('Memory counters unavailable')

  const snapshot = {
    sampledAt: new Date().toISOString(),
    cpuPercent: totalTicks > 0 ? Math.max(0, Math.min(100, busyTicks / totalTicks * 100)) : null,
    loadAverage: loadavg(),
    memory: { totalBytes: memoryTotal, availableBytes: memoryAvailable },
    disk: { totalBytes: disk.blocks * disk.bsize, availableBytes: disk.bavail * disk.bsize },
    services,
    servicesSampledAt,
    storage,
    storageSampledAt,
  }
  await writeFile(`${metricsFile}.tmp`, JSON.stringify(snapshot), { mode: 0o644 })
  await rename(`${metricsFile}.tmp`, metricsFile)
  return cpu
}

function readDocker(path) {
  return new Promise((resolve, reject) => {
    const req = request({
      socketPath: '/var/run/docker.sock',
      method: 'GET',
      path,
      signal: AbortSignal.timeout(30_000),
    }, res => {
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`Docker returned status ${res.statusCode}`))
        return
      }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      res.on('error', reject)
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

const size = value => Number.isSafeInteger(value) && value >= 0 ? value : null

function sumSizes(items, getSize) {
  if (!Array.isArray(items)) return null
  const sizes = items.map(getSize).map(size)
  return sizes.every(value => value !== null) ? sizes.reduce((sum, value) => sum + value, 0) : null
}

function summarizeStorage(usage, containers) {
  const imageBytes = size(usage.LayersSize)
  const writableBytes = sumSizes(usage.Containers, container => container.SizeRw)
  const volumeBytes = sumSizes(usage.Volumes, volume => volume.UsageData?.Size)
  const buildCacheBytes = sumSizes(usage.BuildCache, record => record.Size)
  const exclusiveCacheBytes = sumSizes(usage.BuildCache?.filter(record => record.Shared === false), record => record.Size)
  const app = containers.find(container => container.State === 'running' && container.Labels?.['com.docker.compose.service'] === 'app')
  const appImage = app && usage.Images?.find(image => image.Id === app.ImageID)
  const appImageBytes = size(appImage?.Size)
  const components = [imageBytes, writableBytes, volumeBytes, exclusiveCacheBytes]
  return {
    imageBytes,
    writableBytes,
    volumeBytes,
    buildCacheBytes,
    exclusiveCacheBytes,
    appImageBytes,
    totalBytes: components.includes(null) ? null : components.reduce((sum, value) => sum + value, 0),
  }
}

async function collectServices() {
  const usage = await readDocker('/system/df').catch(error => {
    console.error('Docker disk usage:', error.message)
    return null
  })
  const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${project}`] }))
  const containers = (usage?.Containers ?? await readDocker(`/containers/json?all=true&size=true&filters=${filters}`))
    .filter(container => container.Labels?.['com.docker.compose.project'] === project)
  services = containers
    .filter(container => container.Labels['com.docker.compose.oneoff'] !== 'True' && container.Labels['com.docker.compose.service'])
    .map(container => ({
      service: container.Labels['com.docker.compose.service'],
      name: container.Names[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
      state: container.State,
      writableBytes: size(container.SizeRw),
      totalBytes: size(container.SizeRootFs),
    }))
    .sort((a, b) => a.service.localeCompare(b.service) || a.name.localeCompare(b.name))
  servicesSampledAt = new Date().toISOString()
  if (usage) {
    storage = summarizeStorage(usage, containers)
    storageSampledAt = servicesSampledAt
  }
}

async function collectServicesPeriodically() {
  while (true) {
    try { await collectServices() } catch (error) { console.error('Docker service sizes:', error.message) }
    await delay(120_000)
  }
}

void collectServicesPeriodically()
let previousCpu = await readCpu()
await delay(1000)
while (true) {
  try { previousCpu = await collectHost(previousCpu) } catch (error) { console.error('Host metrics:', error.message) }
  await delay(15_000)
}
