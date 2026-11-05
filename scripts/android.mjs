import { shellConfig } from './shell-config.mjs'
import { loadEnvFile } from 'node:process'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync, symlinkSync } from 'node:fs'
import { resolve } from 'node:path'

try { loadEnvFile('.env') } catch (error) { if (error.code !== 'ENOENT') throw error }
const mode = process.argv[2]
if (!['init', 'build', 'dev', 'release'].includes(mode)) throw new Error('Expected init, build, release or dev')
const storage = process.env.MAGNAT_ANDROID_STORAGE_ROOT || '/Volumes/KINGSTON/Developer/Android'
if (!existsSync(storage)) throw new Error(`Подключите SSD: ${storage}`)
const sdk = process.env.ANDROID_HOME || resolve(storage, 'sdk')
const java = process.env.MAGNAT_ANDROID_JAVA_HOME || resolve(storage, 'jdk21/Contents/Home')
const ndks = readdirSync(resolve(sdk, 'ndk')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
if (!ndks.length && !process.env.NDK_HOME) throw new Error('Установите Android NDK (Side by side)')
const ndk = process.env.NDK_HOME || resolve(sdk, 'ndk', ndks.at(-1))
const caches = resolve(storage, '../BuildCaches')
const gradle = resolve(caches, 'gradle'), temp = resolve(caches, 'tmp')
for (const dir of [gradle, temp]) mkdirSync(dir, { recursive: true })
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
  NDK_HOME: ndk, GRADLE_USER_HOME: gradle, TMPDIR: `${temp}/`, CARGO_BUILD_JOBS: '2' }
env.PATH = `${java}/bin:${env.PATH}`

function linkBuildFolders() {
  for (const relative of ['build', 'app/build', '.gradle', 'buildSrc/build', 'buildSrc/.gradle', 'buildSrc/.kotlin']) {
    const source = resolve('src-tauri/gen/android', relative)
    const target = resolve(storage, 'magnat-build', relative)
    mkdirSync(target, { recursive: true })
    if (existsSync(source)) {
      if (realpathSync(source) !== realpathSync(target)) throw new Error(`Перенесите существующий каталог сборки на SSD: ${source}`)
    } else {
      mkdirSync(resolve(source, '..'), { recursive: true })
      symlinkSync(target, source, 'dir')
    }
  }
}
let args = ['android', mode === 'release' ? 'build' : mode]
if (mode === 'init') args.push('--ci', '--skip-targets-install')
else {
  linkBuildFolders()
  if (!env.MAGNAT_SERVER_URL) throw new Error('Задайте MAGNAT_SERVER_URL — адрес сайта, доступный с Android-телефона')
  const server = new URL(env.MAGNAT_SERVER_URL)
  if (!['http:', 'https:'].includes(server.protocol) || server.username || server.password || server.pathname !== '/' || server.search || server.hash) throw new Error('Нужен http(s) origin без пути и секретов')
  if (['localhost', '127.0.0.1', '[::1]'].includes(server.hostname)) throw new Error('Для Android укажите сетевой адрес сервера вместо localhost')
  mkdirSync('.local', { recursive: true })
  const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${server.origin}; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost ${server.origin}; object-src 'none'; base-uri 'self'`
  const config = resolve('.local/tauri.android-device.json')
  const shell = shellConfig(server.origin, JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version)
  writeFileSync(config, JSON.stringify({ ...shell, app: { ...shell.app, security: { csp } } }, null, 2))
  const xmlDir = 'src-tauri/gen/android/app/src/debug/res/xml'
  mkdirSync(xmlDir, { recursive: true })
  writeFileSync(`${xmlDir}/network_security_config.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n  <base-config cleartextTrafficPermitted="false"/>\n${server.protocol === 'http:' ? `  <domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">${server.hostname}</domain></domain-config>\n` : ''}</network-security-config>\n`)
  args.push('--config', config)
  if (mode === 'build') args.push('--debug', '--apk', '--target', 'aarch64')
  if (mode === 'release') {
    const prepared = spawnSync(process.execPath, ['scripts/prepare-shell.mjs', 'android'], { stdio: 'inherit', env })
    if (prepared.status !== 0) process.exit(prepared.status ?? 1)
    args.push('--apk', '--target', 'aarch64', '--config', resolve('.local/tauri.shell.android.json'))
  }
}
args.push(...process.argv.slice(3))
const result = spawnSync(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', ...args], { stdio: 'inherit', env })
if (result.status !== 0) process.exit(result.status ?? 1)
if (mode === 'init') {
  linkBuildFolders()
  // Direct Node invocation can make Tauri generate `node tauri ...`. Resolve the
  // installed CLI relative to the Rust project (the Gradle task's working dir).
  const task = 'src-tauri/gen/android/buildSrc/src/main/java/ru/magnat/password/kotlin/BuildTask.kt'
  const source = readFileSync(task, 'utf8')
    .replace(/val executable = """[^\n]+""";/, 'val executable = """node""";')
    .replace(/val args = listOf\([^\n]+\);/, 'val args = listOf("../node_modules/@tauri-apps/cli/tauri.js", "android", "android-studio-script");')
  writeFileSync(task, source)
}
