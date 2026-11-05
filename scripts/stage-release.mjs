import { mkdirSync, copyFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { releaseStorage } from './release-storage.mjs'
const { root, staging } = releaseStorage()
mkdirSync('.local', { recursive: true })
if (process.argv[2] === 'save') {
  const plan = JSON.parse(readFileSync('.local/release-plan.json', 'utf8'))
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(plan.version)) throw new Error('Invalid release version')
  if (existsSync(join(root, plan.version))) throw new Error('Version is already published. Set a new version in admin before building.')
  if (existsSync(join(root, 'latest.json'))) {
    const latest = JSON.parse(readFileSync(join(root, 'latest.json'), 'utf8')).version
    const next = plan.version.split('.').map(Number), current = latest.split('.').map(Number)
    const changed = next.findIndex((part, index) => part !== current[index])
    if (changed < 0 || next[changed] <= current[changed]) throw new Error('Release version must increase')
  }
  mkdirSync(staging, { recursive: true })
  copyFileSync('.local/release-plan.json', join(staging, 'release-plan.json'))
} else if (process.argv[2] === 'load') copyFileSync(join(staging, 'release-plan.json'), '.local/release-plan.json')
else throw new Error('Expected save or load')
