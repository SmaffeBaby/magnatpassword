export default defineEventHandler(async (event) => {
  const { user } = await requireSiteAdmin(event)
  return { id: user.id, email: user.email }
})
