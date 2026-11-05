import { shellConfig } from './shell-config.mjs'
import { loadEnvFile } from 'node:process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

if (process.platform !== 'darwin') throw new Error('Сборка DMG выполняется на macOS.')
try { loadEnvFile('.env') } catch (error) { if (error.code !== 'ENOENT') throw error }
if (!process.env.MAGNAT_SERVER_URL) throw new Error('Задайте MAGNAT_SERVER_URL — адрес сайта, доступный с целевого Mac.')
const server = new URL(process.env.MAGNAT_SERVER_URL)
if (!['http:', 'https:'].includes(server.protocol) || server.username || server.password || server.pathname !== '/' || server.search || server.hash) throw new Error('MAGNAT_SERVER_URL должен быть http(s) origin без пути и секретов.')
if (['localhost', '127.0.0.1', '[::1]'].includes(server.hostname)) throw new Error('Для установки на другой Mac укажите сетевой адрес сервера вместо localhost.')
mkdirSync('.local', { recursive: true })
const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${server.origin}; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost ${server.origin}; object-src 'none'; base-uri 'self'`
const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const exceptions = server.protocol === 'http:' ? `<key>NSExceptionDomains</key><dict><key>${xml(server.hostname)}</key><dict><key>NSExceptionAllowsInsecureHTTPLoads</key><true/></dict></dict>` : ''
writeFileSync('.local/Info.macos-server.plist', `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>NSLocalNetworkUsageDescription</key><string>Подключение к серверу Magnat в вашей локальной сети.</string><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/>${exceptions}</dict></dict></plist>\n`)
const shell = shellConfig(server.origin, JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version)
const config = resolve('.local/tauri.macos-server.json')
writeFileSync(config, JSON.stringify({
  ...shell,
  app: { ...shell.app, security: { ...shell.app.security, csp } },
  bundle: { macOS: { infoPlist: '../.local/Info.macos-server.plist' } }
}, null, 2))
const result = spawnSync(process.execPath, [
  'node_modules/@tauri-apps/cli/tauri.js', 'build', '--target', 'aarch64-apple-darwin',
  '--bundles', 'app,dmg', '--config', config, ...process.argv.slice(2)
], { stdio: 'inherit', env: { ...process.env, CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '2' } })
process.exit(result.status ?? 1)
