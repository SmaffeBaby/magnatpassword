import { randomUUID } from 'node:crypto'
import { companyInputSchema } from '../../../../shared/utils/project-companies'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), body = await sharedBody(event,companyInputSchema), id = randomUUID()
  await saveProjectCompany(event,context,id,0,body)
  return {id}
})
