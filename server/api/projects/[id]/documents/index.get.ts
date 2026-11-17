export default defineEventHandler(async event => {
  const current = await readProjectDocuments(event)
  await cleanupProjectDocuments(current.context)
  return current.files
})
