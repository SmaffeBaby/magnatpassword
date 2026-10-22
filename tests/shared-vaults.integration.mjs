import assert from 'node:assert/strict'
import { randomBytes, randomUUID, pbkdf2Sync, createCipheriv } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
const app = process.argv[2] || process.env.SHARED_TEST_APP_URL || 'http://127.0.0.1:3003'
const api = process.env.NUXT_SUPABASE_URL || 'http://127.0.0.1:8003'
if (!['localhost', '127.0.0.1'].includes(new URL(api).hostname) || !['localhost', '127.0.0.1', '192.168.10.162'].includes(new URL(app).hostname)) throw new Error('Integration fixtures are restricted to local services')
const service = createClient(api, process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const run = randomUUID(), users = []
let checks = 0
async function request(user, path, method = 'GET', body, expected = 200) {
  const response = await fetch(app + (path.startsWith('/personal-vault') ? '/api' : '/api/shared-vaults') + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const result = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`)
  checks++; return result
}
async function account(brand) {
  const email = `shared-fixture-${users.length}-${run}@example.invalid`, password = randomBytes(32).toString('base64url')
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { account_brand: brand, shared_test_run: run } })
  if (error) throw new Error('Unable to create isolated auth fixture: ' + error.message)
  const user = { id: data.user.id, email, token: '', client: createClient(api, process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) }
  users.push(user)
  const login = await user.client.auth.signInWithPassword({ email, password })
  if (login.error) throw new Error('Unable to log in auth fixture')
  user.token = login.data.session.access_token
  return user
}
try {
  const owner = await account('magnat'), member = await account('light'), outsider = await account('magnat')
  await request(null, '', 'GET', undefined, 401)
  await request(null, '/personal-vault', 'GET', undefined, 401)
  const personal = await request(owner, '/personal-vault')
  assert.equal(personal.migrationRequired, false)
  const privateData = { version: 1, categories: [], entries: [{ id: randomUUID(), title: 'private-fixture', url: '', username: '', password: 'private-only', notes: '', categoryId: '', favorite: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }
  await request(owner, '/personal-vault', 'PUT', { revision: personal.revision, data: privateData })
  await request(owner, '/personal-vault', 'PUT', { revision: personal.revision, data: privateData }, 409)
  assert.deepEqual((await request(owner, '/personal-vault')).data, privateData)
  assert.equal((await request(member, '/personal-vault')).data.entries.length, 0)
  const backup = await request(owner, '/personal-vault/backup')
  assert.equal(backup.format, 'magnat-password-server-v1')
  assert.equal(JSON.stringify(backup).includes('private-only'), false)
  const legacyPassword = randomBytes(24).toString('base64'), salt = randomBytes(32), iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', pbkdf2Sync(legacyPassword, salt, 600000, 32, 'sha256'), iv)
  cipher.setAAD(Buffer.from(outsider.id))
  const legacyEncrypted = { version: 1, iv: iv.toString('base64'), ciphertext: Buffer.concat([cipher.update(JSON.stringify(privateData)), cipher.final(), cipher.getAuthTag()]).toString('base64') }
  const inserted = await service.from('vaults').insert({ user_id: outsider.id, salt: salt.toString('base64'), encrypted_data: legacyEncrypted, encryption_mode: 'client' })
  assert.ifError(inserted.error)
  assert.equal((await request(outsider, '/personal-vault')).migrationRequired, true)
  await request(outsider, '/personal-vault/migrate', 'POST', { password: 'wrong-fixture-password' }, 400)
  const unchanged = await service.from('vaults').select('encrypted_data,encryption_mode').eq('user_id', outsider.id).single()
  assert.deepEqual(unchanged.data.encrypted_data, legacyEncrypted)
  assert.equal(unchanged.data.encryption_mode, 'client')
  const migrated = await request(outsider, '/personal-vault/migrate', 'POST', { password: legacyPassword })
  assert.deepEqual(migrated.data, privateData)
  assert.deepEqual((await request(outsider, '/personal-vault')).data, privateData)
  const blockedLegacyWrite = await outsider.client.from('vaults').update({ encrypted_data: legacyEncrypted }).eq('user_id', outsider.id)
  assert.ok(blockedLegacyWrite.error)
  await request(outsider, '/personal-vault/migrate', 'POST', { password: legacyPassword }, 409)

  const { id } = await request(owner, '', 'POST', { name: 'Fixture team' })
  let group = (await request(owner, '')).find(g => g.id === id)
  assert.equal((await request(member, '')).length, 0)
  const data = { version: 1, categories: [], entries: [{ id: randomUUID(), title: 'fixture-shared-secret', url: '', username: 'fixture', password: 'not-a-real-password', notes: '', categoryId: '', favorite: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }
  await request(outsider, `/${id}`, 'PUT', { revision: 1, data }, 403)
  await request(owner, `/${id}/members`, 'POST', { revision: group.revision, email: member.email })
  // From this point the owner sends no request: the new member can read and write independently.
  let received = (await request(member, '')).find(g => g.id === id)
  assert.ok(received)
  assert.equal(received.members.find(m => m.userId === member.id).brand, 'light')
  await request(member, `/${id}`, 'PUT', { revision: received.revision, data })
  received = (await request(member, '')).find(g => g.id === id)
  assert.deepEqual(received.data, data)
  await request(member, `/${id}/members`, 'POST', { revision: received.revision, email: outsider.email }, 403)
  await request(member, `/${id}/members`, 'DELETE', { revision: received.revision, userId: owner.id }, 403)
  await request(owner, `/${id}`, 'PUT', { revision: 1, data }, 409)
  group = (await request(owner, '')).find(g => g.id === id)
  await request(owner, `/${id}/members`, 'POST', { revision: group.revision, email: member.email }, 409)
  await request(owner, `/${id}/members`, 'POST', { revision: group.revision, email: `absent-${run}@example.invalid` }, 404)
  await request(owner, `/${id}/members`, 'DELETE', { revision: group.revision, userId: owner.id }, 400)
  await request(owner, `/${id}`, 'PUT', { revision: group.revision, data, p_actor: outsider.id }, 400)
  const { data: row, error } = await service.from('shared_vaults').select('encrypted_data,key_epoch').eq('id', id).single()
  assert.ifError(error)
  assert.equal(JSON.stringify(row.encrypted_data).includes('not-a-real-password'), false)
  assert.equal(JSON.stringify(row.encrypted_data).includes('fixture-shared-secret'), false)
  await request(member, `/${id}`, 'PATCH', { revision: group.revision, name: 'Not allowed' }, 403)
  await request(owner, `/${id}`, 'PATCH', { revision: group.revision, name: 'Renamed fixture' })
  group = (await request(owner, '')).find(g => g.id === id)
  assert.equal(group.name, 'Renamed fixture')
  const fieldId = randomUUID()
  data.entries[0].customFields = [{ id: fieldId, label: 'API ключ', value: 'fixture-secret-field', type: 'secret' }]
  data.entries.push({ ...data.entries[0], id: randomUUID(), title: 'Linked fixture', customFields: [] })
  data.entries[0].links = [{ id: randomUUID(), targetVaultId: id, targetEntryId: data.entries[1].id, sourceFieldId: fieldId, targetFieldId: 'card', label: 'Интеграция' }]
  await request(member, `/${id}`, 'PUT', { revision: group.revision, data })
  group = (await request(owner, '')).find(g => g.id === id)
  assert.deepEqual(group.data.entries[0].links, data.entries[0].links)
  assert.deepEqual(group.data.entries[0].customFields, data.entries[0].customFields)
  const personalBeforeRename = await request(owner, '/personal-vault')
  await request(owner, '/personal-vault', 'PUT', { revision: personalBeforeRename.revision, data: { ...personalBeforeRename.data, name: 'My renamed vault' } })
  assert.equal((await request(owner, '/personal-vault')).data.name, 'My renamed vault')
  const direct = await member.client.from('shared_vaults').select('*')
  assert.ok(direct.error || direct.data.length === 0, 'authenticated database role must not bypass application authorization')
  const forbiddenDirectory = await outsider.client.rpc('shared_vault_directory', { p_actor: owner.id })
  assert.ok(forbiddenDirectory.error, 'client roles cannot call the privileged directory function')
  const forbiddenMutation = await outsider.client.rpc('shared_vault_mutate', { p_actor: owner.id, p_action: 'invite', p_id: id, p_revision: group.revision, p_payload: { email: outsider.email } })
  assert.ok(forbiddenMutation.error, 'client roles cannot impersonate the owner through privileged RPC')
  await request(owner, `/${id}/members`, 'DELETE', { revision: group.revision, userId: member.id })
  assert.equal((await request(member, '')).length, 0)
  await request(member, `/${id}`, 'PUT', { revision: received.revision, data }, 403)
  assert.equal((await request(outsider, '')).length, 0)
  const rotated = await service.from('shared_vaults').select('key_epoch,encrypted_data').eq('id', id).single()
  assert.equal(rotated.data.key_epoch, row.key_epoch + 1)
  assert.notEqual(rotated.data.encrypted_data.ciphertext, row.encrypted_data.ciphertext)
  assert.deepEqual((await request(owner, '')).find(g => g.id === id).data, data)
  console.log(`Vault integration: ${checks} HTTP checks passed; HTTP personal vaults, lossless legacy migration, offline owner, cross-brand access, authorization, conflicts and revocation verified.`)
} finally {
  for (const user of users.reverse()) {
    const { data } = await service.auth.admin.getUserById(user.id)
    if (data.user?.user_metadata?.shared_test_run !== run) throw new Error('Fixture ownership could not be verified; cleanup stopped')
    const { error } = await service.auth.admin.deleteUser(user.id)
    if (error) throw new Error('Fixture cleanup failed')
  }
  console.log('Temporary auth fixtures cleaned up.')
}
