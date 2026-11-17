import {requireProjectsUser,projectFailure,projectNameSchema} from '../../utils/projects'
export default defineEventHandler(async event => {
 const c=await requireProjectsUser(event),body=await sharedBody(event,projectNameSchema)
 const result=await c.client.rpc('project_workspace_action',{p_actor:c.user.id,p_id:null,p_revision:0,p_action:'folder',p_data:body})
 if(result.error)projectFailure(result.error)
 return result.data
})
