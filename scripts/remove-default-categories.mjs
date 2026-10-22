import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
async function sourceModule(path) {
  const { code } = await transform(await readFile(new URL(path, import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}
const { openSharedVault, sealSharedVault } = await sourceModule('../server/utils/shared-crypto.ts')
const { withoutDefaultCategories } = await sourceModule('../shared/utils/vault-data.ts')
const api = process.env.NUXT_SUPABASE_URL || 'http://127.0.0.1:8003'
if (!['localhost', '127.0.0.1'].includes(new URL(api).hostname)) throw new Error('Run category cleanup against the local Supabase only')
const secret = process.env.NUXT_SHARED_VAULT_KEY
if (!secret || Buffer.from(secret, 'base64').length !== 32) throw new Error('Server vault key is missing')
const client = createClient(api, process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
let changed = 0, legacy = 0
for (const table of ['vaults', 'shared_vaults']) {
  for (let offset = 0; ; offset += 200) {
    const { data: rows, error } = await client.from(table).select('*').order(table === 'vaults' ? 'user_id' : 'id').range(offset, offset + 199)
    if (error) throw new Error('Cannot load vaults for category cleanup')
    for (const row of rows) {
      if (table === 'vaults' && row.encryption_mode !== 'server') { legacy++; continue }
      const id = table === 'vaults' ? `personal:${row.user_id}` : row.id, epoch = table === 'vaults' ? 1 : row.key_epoch
      const original = openSharedVault(row.encrypted_data, secret, id, epoch), clean = withoutDefaultCategories(original)
      if (clean === original) continue
      const { data: updated, error: failure } = await client.from(table).update({ encrypted_data: sealSharedVault(clean, secret, id, epoch), revision: row.revision + 1, updated_at: new Date().toISOString() }).eq(table === 'vaults' ? 'user_id' : 'id', table === 'vaults' ? row.user_id : row.id).eq('revision', row.revision).select('revision').maybeSingle()
      if (failure || !updated) throw new Error('Concurrent change during cleanup; rerun to finish without overwriting newer data')
      changed++
    }
    if (rows.length < 200) break
  }
}
console.log(`Default categories removed from ${changed} vaults. Credentials preserved. ${legacy} legacy vaults will be cleaned during their existing master-password migration.`)
