export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), project = projectId(event)
  const rows = await readProjectPasswords(context, project)
  return rows.map(({ encryptedData, ...row }) => ({ ...row, entry: decodeProjectPassword(event, project, row.id, encryptedData) }))
})
