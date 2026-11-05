import { writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
const properties = 'src-tauri/gen/android/keystore.properties'
const key = resolve('.local/android-release.jks')
if (process.argv[2] === 'clean') {
  for (const path of [key, properties]) { try { unlinkSync(path) } catch (error) { if (error.code !== 'ENOENT') throw error } }
} else {
  for (const name of ['ANDROID_KEY_BASE64', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) if (!process.env[name]) throw new Error(`Set ${name}`)
  writeFileSync(key, Buffer.from(process.env.ANDROID_KEY_BASE64, 'base64'), { mode: 0o600 })
  const escape = value => value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('\r', '\\r').replaceAll('=', '\\=').replaceAll(':', '\\:').replaceAll(' ', '\\ ')
  writeFileSync(properties, [
    `storeFile=${escape(key)}`, `keyAlias=${escape(process.env.ANDROID_KEY_ALIAS)}`,
    `password=${escape(process.env.ANDROID_KEY_PASSWORD)}`,
    `storePassword=${escape(process.env.ANDROID_STORE_PASSWORD || process.env.ANDROID_KEY_PASSWORD)}`
  ].join('\n'), { mode: 0o600 })
}
