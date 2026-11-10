import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {kabanId,kabanFailure,readKabanTaskData,kabanBucket} from '../../../../utils/kaban'
import {openSharedVault,sealSharedVault} from '../../../../utils/shared-crypto'
import type {KabanFile} from '../../../../../shared/types/kaban'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),id=kabanId(event)
 const body=await sharedBody(event,z.object({boardId:z.uuid(),revision:z.number().int().positive(),categoryId:z.string().min(1).max(128)}).strict())
 const access=await context.client.rpc('kaban_task_access',{p_actor:context.user.id,p_task:id,p_write:true,p_board:body.boardId})
 if(access.error)kabanFailure(access.error)
 if(access.data.revision!==body.revision)kabanFailure({message:'REVISION_CONFLICT'})
 const board=await context.client.from('kaban_boards').select('stages').eq('id',body.boardId).single()
 if(board.error)kabanFailure(board.error)
 const stage=board.data!.stages.find((item:any)=>!item.done)||board.data!.stages[0]
 const currentFiles=await context.client.from('kaban_files').select('*').eq('task_id',id)
 if(currentFiles.error)kabanFailure(currentFiles.error)
 const newId=randomUUID(),copied:string[]=[],files=[]
 const assignments=async(ids:string[])=>{
  const allowed:string[]=[]
  for(const user of ids){const check=await context.client.rpc('kaban_location_allowed',{p_actor:user,p_board:body.boardId,p_categories:[body.categoryId]});if(check.error)kabanFailure(check.error);if(check.data)allowed.push(user)}
  return allowed
 }
 const participantIds=await assignments(access.data.participant_ids)
 const data=readKabanTaskData(event,access.data)
 try{
  for(const file of currentFiles.data??[]){
   const next=randomUUID(),path=`${newId}/${next}`
   const metadata=openSharedVault<KabanFile>(file.encrypted_data,sharedSecret(event),`kaban-file:${id}:${file.id}`,1)
   const result=await context.client.storage.from(kabanBucket).copy(`${id}/${file.id}`,path)
   if(result.error)throw createError({statusCode:503,message:'Не удалось скопировать вложения задачи.'})
   copied.push(path)
   files.push({id:next,sourceId:file.id,sourceEncrypted:file.encrypted_data,encryptedData:sealSharedVault({...metadata,id:next,createdAt:new Date().toISOString()},sharedSecret(event),`kaban-file:${newId}:${next}`,1)})
  }
  const result=await context.client.rpc('kaban_copy_task',{p_actor:context.user.id,p_source:body.boardId,p_task:id,p_revision:body.revision,p_new:newId,p_payload:{stageId:stage.id,categoryIds:[body.categoryId],participantIds,closerIds:[],encryptedData:sealSharedVault(data,sharedSecret(event),`kaban-task:${newId}`,1)},p_files:files})
  if(result.error)kabanFailure(result.error)
  return {id:newId}
 }catch(error){if(copied.length)await context.client.storage.from(kabanBucket).remove(copied);throw error}
})
