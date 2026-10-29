import { companyUpdateSchema } from '../../../../shared/utils/project-companies'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), {revision,...body} = await sharedBody(event,companyUpdateSchema)
  await saveProjectCompany(event,context,companyId(event),revision,body)
  return {ok:true}
})
