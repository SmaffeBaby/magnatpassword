import {requireProjectsUser,projectFailure} from '../../utils/projects'
export default defineEventHandler(async event => {
 const c=await requireProjectsUser(event)
 const result=await c.client.from('project_folders').select('id,name').eq('user_id',c.user.id).order('name')
 if(result.error)projectFailure(result.error)
 return result.data
})
