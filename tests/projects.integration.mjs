import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const app = process.env.PROJECT_TEST_APP_URL || 'http://127.0.0.1:3003'
const api = process.env.PROJECT_TEST_API_URL || 'http://127.0.0.1:8003'
for (const url of [app, api]) if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Project fixtures require local services')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(api, process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY, options)
const users = [], run = randomUUID(), marker = `projectfixture${run.replaceAll('-', '')}`
let checks = 0
async function request(user, path, method = 'GET', body, expected = 200) {
  const response = await fetch(app + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const result = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: expected ${expected}, got ${response.status}: ${JSON.stringify(result)}`)
  checks++; return result
}
async function account(label) {
  const email = `projects-${run}-${label}@example.test`, password = randomBytes(24).toString('base64url')
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${marker} ${label}` } })
  if (error) throw error
  const user = { id: data.user.id, token: '', client: createClient(api, process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY, options) }
  users.push(user)
  const login = await user.client.auth.signInWithPassword({ email, password })
  if (login.error) throw login.error
  user.token = login.data.session.access_token
  return user
}
try {
  const admin = await account('admin'), owner = await account('owner'), viewer = await account('viewer'), editor = await account('editor'), outsider = await account('outsider')
  const { error } = await service.from('site_admins').insert({ user_id: admin.id })
  if (error) throw error
  await request(null, '/api/projects/access', 'GET', undefined, 401)
  await request(null, '/api/projects', 'GET', undefined, 401)
  await request(null, '/api/projects', 'POST', { name: 'Denied' }, 401)
  assert.equal((await request(owner, '/api/projects/access')).allowed, false)
  await request(owner, '/api/projects', 'GET', undefined, 403)
  await request(owner, '/api/admin/projects/access', 'GET', undefined, 403)
  await request(owner, '/api/admin/projects/access', 'PUT', { userId: owner.id, enabled: true }, 403)
  for (const user of [admin, owner, viewer, editor]) await request(admin, '/api/admin/projects/access', 'PUT', { userId: user.id, enabled: true })
  assert.equal((await request(owner, '/api/projects/access')).allowed, true)
  const grants = await request(admin, '/api/admin/projects/access')
  for (const user of [admin, owner, viewer, editor]) assert.ok(grants.some(grant => grant.id === user.id))
  await request(owner, '/api/projects', 'POST', { name: '  ' }, 400)
  await request(owner, '/api/projects', 'POST', { name: 'Spoof', ownerId: admin.id }, 400)
  const { id } = await request(owner, '/api/projects', 'POST', { name: `  ${marker}  ` })
  async function project(user = owner) { return (await request(user, '/api/projects')).find(item => item.id === id) }
  let current = await project()
  assert.equal(current.name, marker); assert.equal(current.permission, 'owner'); assert.equal(current.members[0].userId, owner.id)
  assert.equal(await project(admin), undefined)
  await request(admin, `/api/projects/${id}`, 'PUT', { name: 'Stolen', revision: current.revision }, 404)
  await request(owner, `/api/projects/${id}/members`, 'PUT', { userId: outsider.id, permission: 'viewer', revision: current.revision }, 400)
  const candidates = await request(owner, `/api/projects/people?q=${marker}`)
  assert.ok(candidates.some(person => person.id === viewer.id)); assert.ok(!candidates.some(person => person.id === outsider.id || person.id === owner.id))
  for (const [user, permission] of [[viewer, 'viewer'], [editor, 'editor']]) {
    current = await project()
    await request(owner, `/api/projects/${id}/members`, 'PUT', { userId: user.id, permission, revision: current.revision })
  }
  current = await project()
  assert.equal((await project(viewer)).permission, 'viewer')
  assert.equal((await project(editor)).permission, 'editor')
  await request(viewer, `/api/projects/${id}`, 'PUT', { name: 'Denied', revision: current.revision }, 403)
  await request(viewer, `/api/projects/${id}/members`, 'PUT', { userId: viewer.id, permission: 'editor', revision: current.revision }, 403)
  await request(editor, `/api/projects/${id}/members`, 'PUT', { userId: viewer.id, permission: 'hidden', revision: current.revision }, 403)
  await request(editor, `/api/projects/${id}`, 'PUT', { name: `${marker} renamed`, revision: current.revision })
  await request(owner, `/api/projects/${id}`, 'PUT', { name: 'Stale', revision: current.revision }, 409)
  current = await project(); assert.equal(current.name, `${marker} renamed`)
  await request(owner, `/api/projects/${id}/members`, 'PUT', { userId: owner.id, permission: 'hidden', revision: current.revision }, 400)
  await request(owner, `/api/projects/${id}/members`, 'PUT', { userId: viewer.id, permission: 'owner', revision: current.revision }, 400)
  await request(owner, `/api/projects/${id}/members`, 'PUT', { userId: viewer.id, permission: 'hidden', revision: current.revision })
  assert.equal(await project(viewer), undefined)
  current = await project()
  assert.equal(current.members.find(member => member.userId === viewer.id).permission, 'hidden')
  assert.ok(!(await project(editor)).members.some(member => member.userId === viewer.id))
  await request(viewer, `/api/projects/${id}`, 'PUT', { name: 'Hidden edit', revision: current.revision }, 404)
  await request(owner, `/api/projects/${id}/members`, 'PUT', { userId: viewer.id, permission: 'viewer', revision: current.revision })
  await request(admin, '/api/admin/projects/access', 'PUT', { userId: viewer.id, enabled: false })
  assert.equal((await request(viewer, '/api/projects/access')).allowed, false)
  await request(viewer, '/api/projects', 'GET', undefined, 403)
  await request(viewer, '/api/projects', 'POST', { name: 'Revoked create' }, 403)
  await request(viewer, `/api/projects/people?q=${marker}`, 'GET', undefined, 403)
  const eligible = await request(owner, `/api/projects/people?q=${marker}`)
  assert.ok(!eligible.some(person => person.id === viewer.id))
  await request(admin, '/api/admin/projects/access', 'PUT', { userId: viewer.id, enabled: true })
  assert.equal((await project(viewer)).permission, 'viewer')
  current = await project()
  await request(owner, `/api/projects/${id}/members`, 'DELETE', { userId: editor.id, revision: current.revision })
  assert.equal(await project(editor), undefined)
  await request(editor, `/api/projects/${id}`, 'PUT', { name: 'Removed edit', revision: current.revision + 1 }, 404)
  // Neither signed-in clients nor guessed actor IDs can bypass the API using PostgREST.
  for (const table of ['projects', 'project_access', 'project_members']) {
    assert.ok((await viewer.client.from(table).select('*')).error, `Direct ${table} read must fail`); checks++
  }
  assert.ok((await viewer.client.rpc('list_projects', { p_actor: owner.id })).error); checks++
  assert.ok((await viewer.client.rpc('set_project_access', { p_actor: admin.id, p_user: outsider.id, p_enabled: true })).error); checks++
  assert.ok((await viewer.client.rpc('project_mutate', { p_actor: owner.id, p_action: 'rename', p_id: id, p_revision: current.revision, p_payload: { name: 'Bypass' } })).error); checks++
  await request(admin, '/api/admin/projects/access', 'PUT', { userId: owner.id, enabled: false })
  await request(owner, '/api/projects', 'GET', undefined, 403)
  await request(owner, `/api/projects/${id}/members`, 'PUT', { userId: viewer.id, permission: 'hidden', revision: current.revision }, 403)
  assert.equal((await project(viewer)).members.find(member => member.userId === owner.id).hasAccess, false)
  console.log(`Projects integration: ${checks} API/security checks passed`)
} finally {
  const failures = []
  for (const user of users.reverse()) { const { error } = await service.auth.admin.deleteUser(user.id); if (error) failures.push(error.message) }
  if (failures.length) throw new Error('Unable to remove project fixtures: ' + failures.join('; '))
}
