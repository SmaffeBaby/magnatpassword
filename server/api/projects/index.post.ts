import { randomUUID } from 'node:crypto'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event)
  const body = await sharedBody(event, projectNameSchema)
  const id = randomUUID()
  await mutateProject(context, 'create', id, 0, body)
  return { id }
})
