import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const result = spawnSync(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', 'ios', 'init', ...process.argv.slice(2)], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)
// The CLI can generate `node tauri ...`, which Node interprets as a missing
// script inside gen/apple. Use the installed CLI explicitly, relative to SRCROOT.
for (const file of ['project.yml', 'app.xcodeproj/project.pbxproj']) {
  const path = `src-tauri/gen/apple/${file}`
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll('node tauri ios xcode-script', 'node ../../../node_modules/@tauri-apps/cli/tauri.js ios xcode-script'))
}
