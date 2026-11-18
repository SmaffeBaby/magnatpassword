export default defineEventHandler(async event=>{
 const {context,space}=await spaceAssetContext(event),result=await context.client.from('project_space_assets').select('*').eq('space_id',space)
 if(result.error)throw createError({statusCode:503,message:'Не удалось прочитать файлы'})
 return result.data.map(row=>({...openSharedVault<Record<string,unknown>>(row.encrypted_data,sharedSecret(event),`space-asset:${space}:${row.id}`,1),id:row.id,revision:1,permission:'viewer',folderId:null,canManage:false,createdBy:row.created_by,createdAt:row.created_at,updatedAt:row.created_at}))
})
