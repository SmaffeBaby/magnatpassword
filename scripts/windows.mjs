import { loadEnvFile } from 'node:process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

if (process.platform !== 'win32') throw new Error('Запустите windows:build внутри Windows (например, в Parallels).')
try { loadEnvFile('.env') } catch (error) { if (error.code !== 'ENOENT') throw error }
if (!process.env.MAGNAT_SERVER_URL) throw new Error('Задайте MAGNAT_SERVER_URL — адрес сайта, доступный с Windows-компьютера.')
const server = new URL(process.env.MAGNAT_SERVER_URL)
if (!['http:', 'https:'].includes(server.protocol) || server.username || server.password || server.pathname !== '/' || server.search || server.hash) throw new Error('MAGNAT_SERVER_URL должен быть http(s) origin без пути и секретов.')
if (['localhost', '127.0.0.1', '[::1]'].includes(server.hostname)) throw new Error('Укажите сетевой адрес сервера вместо localhost.')
mkdirSync('.local', { recursive: true })
const config = resolve('.local/tauri.windows-server.json')
const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${server.origin}; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost ${server.origin}; object-src 'none'; base-uri 'self'`
writeFileSync(config, JSON.stringify({
  ...(process.env.MAGNAT_WINDOWS_PREBUILT === '1' ? { build: { beforeBuildCommand: '' } } : {}),
  app: { security: { csp } }
}, null, 2))
const result = spawnSync(process.execPath, [
  'node_modules/@tauri-apps/cli/tauri.js', 'build', '--target', 'x86_64-pc-windows-msvc',
  '--bundles', 'nsis', '--config', config, ...process.argv.slice(2)
], { stdio: 'inherit', env: { ...process.env, CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '2' } })
process.exit(result.status ?? 1)
