import { randomUUID } from 'node:crypto'
import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const body = await sharedBody(event, z.object({ name: z.string().trim().min(1).max(80) }).strict())
  const id = randomUUID(), encryptedData = sealSharedVault({ version: 1, entries: [], categories: [] }, sharedSecret(event), id, 1)
  await mutateShared(context, 'create', id, 0, { name: body.name, encryptedData })
  return { id }
})
