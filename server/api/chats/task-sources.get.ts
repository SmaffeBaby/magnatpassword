import {canViewProjectSection} from '~~/shared/utils/project-permissions'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event)
 const [{data:projects,error:failure},{data:members,error}]=await Promise.all([context.client.rpc('list_projects',{p_actor:context.user.id}),context.client.from('shared_vault_members').select('vault_id').eq('user_id',context.user.id)])
 if(failure||error)throw createError({statusCode:503,message:'Не удалось загрузить доски Кабана'})
 const groups=members.length?await context.client.from('shared_vaults').select('id,name').in('id',members.map(member=>member.vault_id)):{data:[],error:null}
 if(groups.error)throw createError({statusCode:503,message:'Не удалось загрузить доски хранилищ'})
 return [{label:'Личный Кабан',value:'personal'},...(projects??[]).filter((project:any)=>canViewProjectSection(project,'tasks')).map((project:any)=>({label:`Проект · ${project.name}`,value:`project:${project.id}`})),...(groups.data??[]).map(group=>({label:`Хранилище · ${group.name}`,value:`vault:${group.id}`}))]
})
