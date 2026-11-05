import { spawnSync } from 'node:child_process'
const prepared = spawnSync(process.execPath, ['scripts/prepare-shell.mjs', 'ios'], { stdio: 'inherit' })
if (prepared.status !== 0) process.exit(prepared.status ?? 1)
const result = spawnSync(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', 'ios', 'build', '--ci', '--config', '.local/tauri.shell.ios.json', ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
