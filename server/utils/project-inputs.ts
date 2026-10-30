import type { H3Event } from 'h3'
import type { InputCard, ProjectInputs } from '../../shared/types/project-inputs'
import { openSharedVault, sealSharedVault } from './shared-crypto'
import { projectFailure, projectId, requireProjectsUser } from './projects'
import { sharedSecret } from './shared-vaults'
export const inputBucket='project-inputs'
export async function readProjectInputs(event:H3Event,write=false){
 const context=await requireProjectsUser(event),id=projectId(event)
 const {data,error}=await context.client.rpc('project_input_data',{p_actor:context.user.id,p_id:id})
 if(error)projectFailure(error)
 if(write){
  const {data:projects,error:failure}=await context.client.rpc('list_projects',{p_actor:context.user.id})
  if(failure)projectFailure(failure)
  const project=projects?.find((p:any)=>p.id===id)
  if(!project||!['owner','editor'].includes(project.permission))throw createError({statusCode:403,message:'Недостаточно прав для изменения входных данных'})
 }
 const cards:InputCard[]=data.encryptedData?openSharedVault<{cards:InputCard[]}>(data.encryptedData,sharedSecret(event),`project-inputs:${id}`,1).cards:[]
 return {context,id,state:{revision:data.revision,updatedAt:data.updatedAt,cards} as ProjectInputs}
}
export async function saveProjectInputs(event:H3Event,current:Awaited<ReturnType<typeof readProjectInputs>>,revision:number,cards:InputCard[]){
 if(cards.length>500||JSON.stringify(cards).length>4_000_000)throw createError({statusCode:413,message:'Превышен объём карточек проекта'})
 const {data,error}=await current.context.client.rpc('project_input_data',{p_actor:current.context.user.id,p_id:current.id,p_revision:revision,p_data:sealSharedVault({cards},sharedSecret(event),`project-inputs:${current.id}`,1)})
 if(error)projectFailure(error)
 return {revision:data.revision,updatedAt:data.updatedAt,cards} as ProjectInputs
}
export function inputRevision(actual:number,expected:number){if(actual!==expected)throw createError({statusCode:409,message:'Входные данные изменились. Обновите страницу перед сохранением.'})}
