import { readdirSync, readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { releaseStorage } from './release-storage.mjs'
const { staging } = releaseStorage()
const platform = process.argv[2]
const version = JSON.parse(readFileSync('.local/release-plan.json')).version
function walk(path) {
  try { return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
}
const root = process.env.CARGO_TARGET_DIR || 'src-tauri/target'
if (platform === 'ios') {
  function archives(path) {
    try { return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.name.endsWith('.xcarchive') ? [join(path, entry.name)] : entry.isDirectory() ? archives(join(path, entry.name)) : []) }
    catch (error) { if (error.code === 'ENOENT') return []; throw error }
  }
  const found = [...archives('src-tauri/gen/apple/build'), ...archives(root)]
  if (found.length !== 1) throw new Error(`Expected one iOS archive, got ${found.length}`)
  mkdirSync(join(staging, 'ios'), { recursive: true })
  const archive = spawnSync('tar', ['-czf', join(staging, 'ios', `Magnat-${version}-ios-unsigned.xcarchive.tar.gz`), found[0]], { stdio: 'inherit' })
  process.exit(archive.status ?? 1)
}
const all = platform === 'android' ? walk('src-tauri/gen/android/app/build/outputs/apk') : walk(join(root, platform === 'windows' ? 'x86_64-pc-windows-msvc' : 'aarch64-apple-darwin', 'release', 'bundle'))
const output = join(staging, platform)
mkdirSync(output, { recursive: true })
const downloads = [], updates = {}
function copy(pattern, name) {
  const matches = all.filter(file => pattern.test(file) && (platform === 'android' || file.includes(version) || file.endsWith('.app.tar.gz')))
  if (matches.length !== 1) throw new Error(`Expected one ${pattern}, got ${matches.length}: ${matches.join(', ')}`)
  copyFileSync(matches[0], join(output, name))
  return matches[0]
}
if (platform === 'windows') {
  const name = `Magnat-${version}-windows-x86_64.exe`
  copy(/bundle[/\\]nsis[/\\].*\.exe$/, name)
  downloads.push({ platform: 'windows', label: 'Windows · x64', asset: name })
} else if (platform === 'macos') {
  const name = `Magnat-${version}-macos-aarch64.dmg`
  copy(/bundle[/\\]dmg[/\\].*\.dmg$/, name)
  downloads.push({ platform: 'macos', label: 'macOS · Apple Silicon', asset: name })
} else if (platform === 'android') {
  const name = `Magnat-${version}-android-arm64.apk`
  copy(/[/\\]release[/\\].*(?<!unsigned)\.apk$/, name)
  downloads.push({ platform: 'android', label: 'Android · ARM64 APK', asset: name })
} else throw new Error(`Unknown platform: ${platform}`)
writeFileSync(join(output, `${platform}.json`), JSON.stringify({ downloads, updates }, null, 2))
