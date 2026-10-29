import { companyLinkSchema } from '../../../../shared/utils/project-companies'
import { sealSharedVault } from '../../../utils/shared-crypto'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), body = await sharedBody(event,companyLinkSchema), id = projectId(event)
  const current = await projectEstimate(event)
  const {error} = await context.client.rpc('project_company_link',{p_actor:context.user.id,p_project:id,p_catalog:body.catalogId,p_revision:body.revision,p_empty_data:sealSharedVault({items:[],details:current.details,counterparties:[]},sharedSecret(event),`project-estimate:${id}`,1),p_remove:false})
  if (error) companyFailure(error)
  return projectEstimate(event)
})
