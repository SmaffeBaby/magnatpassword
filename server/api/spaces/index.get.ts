export default defineEventHandler(async event=>{
 const context=await requireProjectsUser(event),projects=await context.client.rpc('list_projects',{p_actor:context.user.id})
 if(projects.error)projectFailure(projects.error)
 const result=[]
 for(const project of projects.data||[]){const spaces=await context.client.rpc('space_catalog',{p_actor:context.user.id,p_project:project.id});if(spaces.error)projectFailure(spaces.error);result.push({id:project.id,name:project.name,spaces:spaces.data})}
 return result
})
