import { companyLinkSchema } from '../../../../shared/utils/project-companies'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), body = await sharedBody(event,companyLinkSchema), id = projectId(event)
  const current = await projectEstimate(event)
  const localIds = new Set(current.counterparties.filter(party => party.catalogId === body.catalogId).map(party => party.id))
  if (!localIds.size) throw createError({statusCode:404,message:'Компания не выбрана в этом проекте.'})
  if (current.items.some(item => localIds.has(item.counterpartyId))) throw createError({statusCode:409,message:'Компания используется в смете. Сначала измените привязки позиций.'})
  const {error} = await context.client.rpc('project_company_link',{p_actor:context.user.id,p_project:id,p_catalog:body.catalogId,p_revision:body.revision,p_empty_data:null,p_remove:true})
  if (error) companyFailure(error)
  return projectEstimate(event)
})
