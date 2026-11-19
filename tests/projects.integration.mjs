import assert from 'node:assert/strict'
import { networkInterfaces } from 'node:os'
import { randomUUID, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const app = process.env.PROJECT_TEST_APP_URL || 'http://127.0.0.1:3003'
const api = process.env.PROJECT_TEST_API_URL || 'http://127.0.0.1:8003'
const localHosts = new Set(['localhost', '127.0.0.1', ...Object.values(networkInterfaces()).flat().map(item => item.address)])
for (const url of [app, api]) if (!localHosts.has(new URL(url).hostname)) throw new Error('Project fixtures require local services')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(api, process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY, options)
const users = [], projectIds = [], run = randomUUID(), marker = `projectfixture${run.replaceAll('-', '')}`
let checks = 0
async function request(user, path, method = 'GET', body, expected = 200) {
  const response = await fetch(app + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const text = await response.text()
  assert.ok(text, `${method} ${path}: empty response (${response.status}); check the local proxy address`)
  const result = JSON.parse(text)
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
  assert.equal((await request(owner, '/api/projects/access')).allowed, true)
  assert.deepEqual(await request(owner, '/api/projects'), [])
  await request(owner, '/api/admin/projects/access', 'GET', undefined, 403)
  await request(owner, '/api/admin/projects/access', 'PUT', { userId: owner.id, enabled: true }, 403)
  for (const user of [admin, owner, viewer, editor, outsider]) assert.equal((await request(user, '/api/projects/access')).allowed, true)
  assert.equal((await request(owner, '/api/projects/access')).allowed, true)
  const grants = await request(admin, '/api/admin/projects/access')
  for (const user of [admin, owner, viewer, editor]) assert.ok(grants.some(grant => grant.id === user.id))
  await request(owner, '/api/projects', 'POST', { name: '  ' }, 400)
  await request(owner, '/api/projects', 'POST', { name: 'Spoof', ownerId: admin.id }, 400)
  const { id } = await request(owner, '/api/projects', 'POST', { name: `  ${marker}  ` })
  projectIds.push(id)
  async function project(user = owner) { return (await request(user, '/api/projects')).find(item => item.id === id) }
  let current = await project()
  assert.equal(current.name, marker); assert.equal(current.permission, 'owner'); assert.equal(current.members[0].userId, owner.id)
  assert.equal(await project(admin), undefined)
  await request(admin, `/api/projects/${id}`, 'PUT', { name: 'Stolen', revision: current.revision }, 404)
  assert.equal(await project(outsider), undefined)
  const candidates = await request(owner, `/api/projects/people?q=${marker}`)
  assert.ok(candidates.some(person => person.id === viewer.id)); assert.ok(candidates.some(person => person.id === outsider.id)); assert.ok(!candidates.some(person => person.id === owner.id))
  for (const [user, permission] of [[viewer, 'viewer'], [editor, 'editor']]) {
    current = await project()
    await request(owner, `/api/projects/${id}/members`, 'PUT', { userId: user.id, permission, revision: current.revision })
  }
  current = await project()
  assert.equal((await project(viewer)).permission, 'viewer')
  assert.equal((await project(editor)).permission, 'editor')
  const dashboardPath = `/api/projects/${id}/dashboard`
  await request(null, dashboardPath, 'GET', undefined, 401)
  await request(admin, dashboardPath, 'GET', undefined, 404)
  await request(outsider, dashboardPath, 'GET', undefined, 404)
  const initialDashboard = await request(owner, dashboardPath)
  assert.equal(initialDashboard.revision, 0)
  assert.equal(initialDashboard.blocks.length, 8)
  assert.ok(initialDashboard.blocks.every(block => block.visible))
  const personalBlocks = [...initialDashboard.blocks].reverse().map(block => ({ ...block, visible: block.key === 'members' }))
  const savedDashboard = await request(viewer, dashboardPath, 'PUT', { revision: 0, blocks: personalBlocks })
  assert.equal(savedDashboard.revision, 1)
  assert.deepEqual((await request(viewer, dashboardPath)).blocks, personalBlocks)
  assert.deepEqual((await request(owner, dashboardPath)).blocks, initialDashboard.blocks)
  assert.deepEqual((await request(editor, dashboardPath)).blocks, initialDashboard.blocks)
  assert.equal((await project()).revision, current.revision, 'Personal settings must not change the project revision')
  await request(viewer, dashboardPath, 'PUT', { revision: 0, blocks: initialDashboard.blocks }, 409)
  await request(viewer, dashboardPath, 'PUT', { revision: 1, blocks: [] }, 400)
  await request(viewer, dashboardPath, 'PUT', { revision: 1, blocks: Array(8).fill(initialDashboard.blocks[0]) }, 400)
  await request(viewer, dashboardPath, 'PUT', { revision: 1, blocks: initialDashboard.blocks, userId: owner.id }, 400)
  await request(viewer, dashboardPath, 'PUT', { revision: 1, blocks: initialDashboard.blocks.map(block => ({ ...block, visible: false })) })
  assert.ok((await request(viewer, dashboardPath)).blocks.every(block => !block.visible))
  const resetDashboard = await request(viewer, dashboardPath, 'PUT', { revision: 2, blocks: initialDashboard.blocks })
  assert.deepEqual(resetDashboard.blocks, initialDashboard.blocks)
  const { id: secondId } = await request(owner, '/api/projects', 'POST', { name: `${marker} second` })
  projectIds.push(secondId)
  assert.equal((await request(owner, `/api/projects/${secondId}/dashboard`)).revision, 0)
  await request(viewer, `/api/projects/${secondId}/dashboard`, 'GET', undefined, 404)
  const secondPath = `/api/projects/${secondId}`
  const secondProject = async user => (await request(user, '/api/projects')).find(item => item.id === secondId)
  const secondRevision = async () => (await secondProject(owner)).revision
  const candidatePath = `${secondPath}/member-candidates`
  const initialCandidates = await request(owner, candidatePath)
  assert.ok(initialCandidates.people.length > 0)
  assert.ok(!initialCandidates.people.some(person => person.id === owner.id))
  await request(outsider, candidatePath, 'GET', undefined, 403)
  assert.deepEqual((await secondProject(owner)).roles.map(role => role.id), ['executor', 'observer', 'administrator'])
  await request(owner, `${secondPath}/members`, 'PUT', { userId: editor.id, roleId: 'administrator', revision: await secondRevision() })
  assert.equal((await secondProject(editor)).canManageMembers, true)
  await request(editor, `${secondPath}/members`, 'PUT', { userId: viewer.id, roleId: 'administrator', revision: await secondRevision() }, 403)
  const roleInput = { name: 'Рецензент', permission: 'viewer', sections: { documents: 'hidden', tasks: 'editor' } }
  await request(editor, `${secondPath}/roles`, 'PUT', { ...roleInput, revision: await secondRevision() })
  const role = (await secondProject(owner)).roles.find(item => item.name === roleInput.name)
  assert.ok(role)
  await request(editor, `${secondPath}/members`, 'PUT', { userId: viewer.id, roleId: role.id, revision: await secondRevision() })
  assert.deepEqual((await secondProject(viewer)).sectionPermissions, { documents: 'hidden', economy: 'viewer', tasks: 'editor' })
  assert.ok(!(await request(editor, `${candidatePath}?q=${marker}`)).people.some(person => person.id === viewer.id))
  await request(viewer, `${secondPath}/roles`, 'PUT', { ...roleInput, id: role.id, revision: await secondRevision() }, 403)
  await request(editor, `${secondPath}/roles`, 'PUT', { id: role.id, name: role.name, permission: 'viewer', sections: { tasks: 'hidden' }, revision: await secondRevision() })
  assert.equal((await secondProject(viewer)).sectionPermissions.tasks, 'hidden')
  await request(viewer, `/api/kaban?project=${secondId}`, 'GET', undefined, 403)
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
  await request(viewer, dashboardPath, 'GET', undefined, 404)
  await request(viewer, dashboardPath, 'PUT', { revision: 3, blocks: initialDashboard.blocks }, 404)
  current = await project()
  assert.equal(current.members.find(member => member.userId === viewer.id).permission, 'hidden')
  assert.ok(!(await project(editor)).members.some(member => member.userId === viewer.id))
  await request(viewer, `/api/projects/${id}`, 'PUT', { name: 'Hidden edit', revision: current.revision }, 404)
  await request(owner, `/api/projects/${id}/members`, 'PUT', { userId: viewer.id, permission: 'viewer', revision: current.revision })
  await request(admin, '/api/admin/projects/access', 'PUT', { userId: viewer.id, enabled: false }, 409)
  assert.equal((await request(viewer, '/api/projects/access')).allowed, true)
  assert.equal((await project(viewer)).permission, 'viewer')
  assert.ok((await request(owner, `/api/projects/people?q=${marker}`)).some(person => person.id === viewer.id))

  async function sections(user, permission, sections, expected = 200) {
    const latest = await project()
    return request(owner, `/api/projects/${id}/members`, 'PUT', { userId: user.id, permission, sections, revision: latest.revision }, expected)
  }
  // A viewer of the overview may edit economy; an overview editor may have no economy access.
  await sections(viewer, 'viewer', { economy: 'editor', tasks: 'hidden' })
  await sections(editor, 'editor', { economy: 'hidden', tasks: 'viewer' })
  assert.deepEqual((await project(viewer)).sectionPermissions, { documents: 'viewer', economy: 'editor', tasks: 'hidden' })
  assert.equal((await project(viewer)).taskCount, null)
  for (const resource of ['estimate', 'input-data', 'contracts', 'execution', 'closing', 'progress', 'process-map', 'dashboard']) {
    await request(editor, `/api/projects/${id}/${resource}`, 'GET', undefined, 404)
    await request(viewer, `/api/projects/${id}/${resource}`)
  }
  assert.ok(!(await request(editor, '/api/projects/summaries')).some(p => p.projectId === id))
  // This also checks that a previous authorized result in the server cache cannot leak.
  assert.ok((await request(owner, '/api/projects/summaries')).some(p => p.projectId === id))
  assert.ok(!(await request(editor, '/api/projects/summaries')).some(p => p.projectId === id))
  const estimatePath = `/api/projects/${id}/estimate`
  const estimate = await request(viewer, estimatePath)
  await request(viewer, estimatePath, 'PUT', { revision: estimate.revision })
  const inputPath = `/api/projects/${id}/input-data`
  const inputs = await request(viewer, inputPath)
  const card = { id: randomUUID(), revision: inputs.revision, title: marker, description: '', fields: [] }
  await request(viewer, inputPath, 'PUT', card)
  await request(editor, inputPath, 'PUT', card, 404)
  // Economic rights do not grant the ability to rename the project or invite members.
  current = await project()
  await request(viewer, `/api/projects/${id}`, 'PUT', { name: 'Denied', revision: current.revision }, 403)
  await request(viewer, `/api/projects/${id}/members`, 'PUT', { userId: outsider.id, permission: 'editor', sections: { tasks: 'editor' }, revision: current.revision }, 403)
  const board = await request(owner, `/api/kaban?project=${id}`)
  await request(viewer, `/api/kaban?project=${id}`, 'GET', undefined, 403)
  assert.equal((await request(editor, `/api/kaban?project=${id}`)).canEdit, false)
  assert.equal((await request(editor, `/api/kaban?project=${id}`)).canManage, false)
  const stagesBody = { revision: board.board.revision, stages: board.board.stages }
  await request(editor, `/api/kaban/boards/${board.board.id}/stages`, 'PUT', stagesBody, 403)
  await request(viewer, `/api/kaban/boards/${board.board.id}/stages`, 'PUT', stagesBody, 403)
  // Reverse the grants: read-only economy, editable Kaban, despite read-only overview.
  await sections(viewer, 'viewer', { economy: 'viewer', tasks: 'editor' })
  const readOnlyEstimate = await request(viewer, estimatePath)
  await request(viewer, estimatePath, 'PUT', { revision: readOnlyEstimate.revision }, 403)
  await request(viewer, inputPath, 'PUT', { ...card, revision: (await request(viewer, inputPath)).revision }, 403)
  assert.equal((await request(viewer, `/api/kaban?project=${id}`)).canEdit, true)
  const categoryBody = { boardId: board.board.id, revision: 0, data: { name: marker, color: '#64748b', parentId: null } }
  await request(editor, '/api/kaban/categories', 'POST', categoryBody, 403)
  const category = await request(viewer, '/api/kaban/categories', 'POST', categoryBody)
  const taskBody = { boardId: board.board.id, revision: 0, stageId: board.board.stages[0].id, participantIds: [viewer.id], categoryIds: [category.id], data: { title: marker, description: '', dueOn: '', todos: [] } }
  const task = await request(viewer, '/api/kaban/tasks', 'POST', taskBody)
  await request(editor, '/api/kaban/tasks', 'POST', taskBody, 403)
  const taskPath = `/api/kaban/tasks/${task.id}`
  const savedTask = async () => (await request(viewer, `/api/kaban?project=${id}`)).tasks.find(item => item.id === task.id)
  assert.equal((await savedTask()).startOn ?? '', '')
  const planned = { ...taskBody, revision: (await savedTask()).revision, data: { ...taskBody.data, startOn: '2026-11-19', dueOn: '2026-11-24' } }
  await request(owner, taskPath, 'PUT', planned, 403)
  await request(viewer, taskPath, 'PUT', { ...planned, data: { ...planned.data, startOn: '2026-11-25' } }, 400)
  await request(viewer, taskPath, 'PUT', planned)
  assert.equal((await savedTask()).startOn, planned.data.startOn)
  await request(viewer, taskPath, 'PUT', planned, 409)
  const legacyUpdate = { ...taskBody, revision: (await savedTask()).revision, data: { ...taskBody.data, title: `${marker} planned`, dueOn: planned.data.dueOn } }
  await request(owner, taskPath, 'PUT', legacyUpdate)
  assert.equal((await savedTask()).startOn, planned.data.startOn)
  await request(viewer, taskPath, 'PUT', { ...legacyUpdate, revision: (await savedTask()).revision, data: { ...legacyUpdate.data, startOn: '' } })
  assert.equal((await savedTask()).startOn, '')

  await sections(viewer, 'hidden', { economy: 'editor', tasks: 'editor' })
  assert.equal(await project(viewer), undefined)
  await request(viewer, estimatePath, 'GET', undefined, 404)
  await request(viewer, `/api/kaban/tasks/${task.id}/files`, 'GET', undefined, 403)
  await request(viewer, `/api/kaban/boards/${board.board.id}/history`, 'GET', undefined, 403)
  await request(viewer, `/api/kaban?project=${id}`, 'GET', undefined, 403)
  await sections(viewer, 'viewer', {})
  assert.deepEqual((await project(viewer)).sectionPermissions, { documents: 'viewer', economy: 'viewer', tasks: 'viewer' })
  await sections(viewer, 'viewer', { economy: 'owner' }, 400)
  await sections(viewer, 'viewer', { unexpected: 'editor' }, 400)
  await sections(viewer, 'viewer', { economy: null }, 400)
  current = await project()
  await request(owner, `/api/projects/${id}/members`, 'PUT', { userId: owner.id, permission: 'viewer', sections: { economy: 'hidden', tasks: 'hidden' }, revision: current.revision }, 400)
  assert.equal((await project(owner)).permission, 'owner')
  assert.equal((await request(owner, `/api/kaban?project=${id}`)).canManage, true)
  current = await project()
  await request(owner, `/api/projects/${id}/members`, 'PUT', { userId: viewer.id, permission: 'viewer', sections: { economy: 'editor' }, revision: current.revision - 1 }, 409)
  assert.equal((await project(viewer)).sectionPermissions.economy, 'viewer')
  current = await project()
  await request(owner, `/api/projects/${id}/members`, 'DELETE', { userId: editor.id, revision: current.revision })
  assert.equal(await project(editor), undefined)
  await request(editor, `/api/projects/${id}`, 'PUT', { name: 'Removed edit', revision: current.revision + 1 }, 404)
  // Neither signed-in clients nor guessed actor IDs can bypass the API using PostgREST.
  for (const table of ['projects', 'project_access', 'project_members', 'project_roles', 'project_dashboard_preferences']) {
    assert.ok((await viewer.client.from(table).select('*')).error, `Direct ${table} read must fail`); checks++
  }
  assert.ok((await viewer.client.rpc('list_projects', { p_actor: owner.id })).error); checks++
  assert.ok((await viewer.client.rpc('project_dashboard', { p_actor: owner.id, p_id: id })).error); checks++
  assert.ok((await viewer.client.rpc('set_project_access', { p_actor: admin.id, p_user: outsider.id, p_enabled: true })).error); checks++
  assert.ok((await viewer.client.rpc('project_mutate', { p_actor: owner.id, p_action: 'rename', p_id: id, p_revision: current.revision, p_payload: { name: 'Bypass' } })).error); checks++
  await request(admin, '/api/admin/projects/access', 'PUT', { userId: owner.id, enabled: false }, 409)
  assert.equal((await project()).permission, 'owner')
  assert.equal((await project(viewer)).members.find(member => member.userId === owner.id).hasAccess, true)
  console.log(`Projects integration: ${checks} API/security checks passed`)
} finally {
  const failures = []
  if (projectIds.length) { const { error } = await service.from('projects').delete().in('id', projectIds); if (error) failures.push(error.message) }
  for (const user of users.reverse()) { const { error } = await service.auth.admin.deleteUser(user.id); if (error) failures.push(error.message) }
  if (failures.length) throw new Error('Unable to remove project fixtures: ' + failures.join('; '))
}
