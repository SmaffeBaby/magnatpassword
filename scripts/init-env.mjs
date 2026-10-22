import { randomBytes, createHmac } from 'node:crypto'
import { readFile, writeFile, access } from 'node:fs/promises'
for (const path of ['.env', 'supabase/.env']) {
  try { await access(path); console.error(`${path} exists. Existing configuration was not changed.`); process.exit(1) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
const hex = n => randomBytes(n).toString('hex'), secret = hex(32)
const token = role => {
  const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'supabase', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 10 * 365 * 86400 })}`
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`
}
const values = {
  POSTGRES_PASSWORD: hex(24), JWT_SECRET: secret, ANON_KEY: token('anon'), SERVICE_ROLE_KEY: token('service_role'),
  DASHBOARD_USERNAME: 'magnat', DASHBOARD_PASSWORD: randomBytes(24).toString('base64url'),
  SECRET_KEY_BASE: hex(48), REALTIME_DB_ENC_KEY: hex(8), VAULT_ENC_KEY: hex(16), PG_META_CRYPTO_KEY: hex(32),
  LOGFLARE_PUBLIC_ACCESS_TOKEN: hex(24), LOGFLARE_PRIVATE_ACCESS_TOKEN: hex(24),
  S3_PROTOCOL_ACCESS_KEY_ID: hex(16), S3_PROTOCOL_ACCESS_KEY_SECRET: hex(32), OPENAI_API_KEY: '',
  SUPABASE_PUBLIC_URL: 'http://localhost:8003', API_EXTERNAL_URL: 'http://localhost:3003/supabase/auth/v1',
  SITE_URL: 'http://localhost:3003', STUDIO_DEFAULT_PROJECT: 'Magnat Password', POOLER_TENANT_ID: 'magnat-password',
  ENABLE_EMAIL_AUTOCONFIRM: 'true', ENABLE_PHONE_SIGNUP: 'false', ENABLE_PHONE_AUTOCONFIRM: 'false',
  FUNCTIONS_VERIFY_JWT: 'true', SMTP_ADMIN_EMAIL: 'admin@magnat.local', SMTP_SENDER_NAME: 'Magnat Password'
}
const example = await readFile('supabase/.env.example', 'utf8')
await writeFile('supabase/.env', example.split('\n').map(line => { const key = line.split('=')[0]; return key in values ? `${key}=${values[key]}` : line }).join('\n'), { mode: 0o600, flag: 'wx' })
await writeFile('.env', `NUXT_SUPABASE_URL=http://localhost:8003\nNUXT_SUPABASE_SERVICE_ROLE_KEY=${values.SERVICE_ROLE_KEY}\nNUXT_PUBLIC_SUPABASE_URL=/supabase\nNUXT_PUBLIC_SUPABASE_ANON_KEY=${values.ANON_KEY}\n`, { mode: 0o600, flag: 'wx' })
console.log('Fresh isolated Supabase configuration created. Run docker compose up -d --build.')
