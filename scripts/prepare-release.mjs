import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { shellConfig } from './shell-config.mjs'
const release = JSON.parse(readFileSync('.local/release-plan.json', 'utf8'))
if (!release.notes?.trim()) throw new Error('Set release notes in the administration panel')
mkdirSync('.local', { recursive: true })
writeFileSync('.local/tauri.release.json', JSON.stringify(shellConfig(process.env.MAGNAT_SERVER_URL, release.version), null, 2))

const platform = process.env.RELEASE_PLATFORM
if (platform) {
  const prepared = spawnSync(process.execPath, ['scripts/prepare-shell.mjs', platform], { stdio: 'inherit', env: { ...process.env, MAGNAT_SHELL_VERSION: release.version } })
  if (prepared.status !== 0) process.exit(prepared.status ?? 1)
  writeFileSync('.local/tauri.release.json', readFileSync(`.local/tauri.shell.${platform}.json`))
}
