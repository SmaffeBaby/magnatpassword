export default defineEventHandler(async event=>{
 const {context,space}=await spaceAssetContext(event),rows=await context.client.from('project_space_objects').select('id,data').eq('space_id',space)
 if(rows.error)throw createError({statusCode:503,message:'Не удалось прочитать карточки'})
 const result:Record<string,unknown>={}
 for(const row of rows.data.filter(r=>r.data.kind==='task').slice(0,300)){
  const access=await context.client.rpc('kaban_task_access',{p_actor:context.user.id,p_task:row.data.taskId,p_board:row.data.boardId,p_write:false})
  if(!access.error&&access.data){const data=openSharedVault<{title:string}>(access.data.encrypted_data,sharedSecret(event),`kaban-task:${row.data.taskId}`,1);const board=await context.client.from('kaban_boards').select('project_id,vault_id').eq('id',row.data.boardId).maybeSingle();result[row.id]={title:data.title,completed:!!access.data.closed_at,projectId:board.data?.project_id,vaultId:board.data?.vault_id}}
 }
 return result
})
