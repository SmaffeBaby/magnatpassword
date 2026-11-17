export default defineEventHandler(async event => {
  await requireSharedUser(event)
  return { allowed: true }
})
