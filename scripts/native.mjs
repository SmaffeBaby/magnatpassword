import { loadEnvFile } from 'node:process'
import { spawn } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'

try { loadEnvFile('.env') } catch (error) { if (error.code !== 'ENOENT') throw error }
const mode = process.argv[2]
if (!['dev', 'generate'].includes(mode)) throw new Error('Expected dev or generate')
if (process.env.MAGNAT_NATIVE_BUILD_ROOT) {
  const root = resolve(process.env.MAGNAT_NATIVE_BUILD_ROOT)
  if (!existsSync(root)) throw new Error(`Подключите SSD с каталогом сборки: ${root}`)
  const output = resolve(root, '.output-native')
  if (!existsSync('.output-native') || realpathSync('.output-native') !== realpathSync(output)) {
    throw new Error(`.output-native должна ссылаться на ${output}, чтобы Tauri использовал сборку с SSD`)
  }
}
const server = new URL(process.env.MAGNAT_SERVER_URL || 'http://localhost:3003')
if (!['http:', 'https:'].includes(server.protocol) || server.username || server.password || server.pathname !== '/' || server.search || server.hash) {
  throw new Error('MAGNAT_SERVER_URL must be an http(s) origin without credentials or a path')
}
const child = spawn(process.execPath, [
  'node_modules/@nuxt/cli/bin/nuxi.mjs', mode,
  ...(mode === 'dev' ? ['--host', '0.0.0.0', '--port', '3004'] : [])
], {
  stdio: 'inherit',
  env: { ...process.env, MAGNAT_NATIVE: '1', MAGNAT_SERVER_URL: server.origin, NUXT_PUBLIC_BACKEND_ORIGIN: server.origin }
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', code => process.exit(code ?? 1))
