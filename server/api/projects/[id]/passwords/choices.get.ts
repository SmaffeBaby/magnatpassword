export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event)
  await readProjectPasswords(context, projectId(event))
  return (await projectPasswordCandidates(event, context)).map(({ source, sourceName, entry }) => ({ source, sourceName, title: entry.title, username: entry.username }))
})
