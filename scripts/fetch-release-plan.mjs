import { mkdirSync, writeFileSync } from 'node:fs'
const server = new URL(process.env.MAGNAT_SERVER_URL)
if (!['https:', 'http:'].includes(server.protocol) || server.username || server.password || server.pathname !== '/' || server.search || server.hash) throw new Error('Set an HTTP(S) origin in MAGNAT_SERVER_URL')
if (!process.env.RELEASES_BUILD_TOKEN) throw new Error('Set RELEASES_BUILD_TOKEN')
const response = await fetch(new URL('/api/releases/plan', server), {
  headers: { Authorization: `Bearer ${process.env.RELEASES_BUILD_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(30000)
})
if (!response.ok) throw new Error(`Release plan unavailable: HTTP ${response.status}`)
const plan = await response.json()
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(plan.version) || typeof plan.notes !== 'string' || !plan.notes.trim()) throw new Error('Invalid release plan')
mkdirSync('.local', { recursive: true })
writeFileSync('.local/release-plan.json', JSON.stringify(plan, null, 2))
