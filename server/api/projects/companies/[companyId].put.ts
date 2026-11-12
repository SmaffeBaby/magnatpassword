import { companyUpdateSchema } from '../../../../shared/utils/project-companies'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), {revision,...body} = await sharedBody(event,companyUpdateSchema)
  const id=companyId(event)
  if(body.ogrn===undefined){const previous=(await listProjectCompanies(event,context)).find(row=>row.id===id);if(previous)body.ogrn=previous.ogrn}
  await saveProjectCompany(event,context,id,revision,body)
  return {ok:true}
})
