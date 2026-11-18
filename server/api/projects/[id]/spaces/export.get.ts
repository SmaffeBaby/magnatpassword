export default defineEventHandler(async event=>{
 const {context,space,project}=await spaceAssetContext(event),board=await context.client.from('project_spaces').select('name,description').eq('id',space).single(),objects=await context.client.from('project_space_objects').select('id,data').eq('space_id',space)
 if(board.error||objects.error)throw createError({statusCode:503,message:'Экспорт недоступен'})
 const entries:{path:string;bytes:Buffer}[]=[],files:any[]=[],ids=new Set<string>();let total=0
 for(const object of objects.data){const data=object.data;if(!['image','document'].includes(data.kind))continue;const key=data.assetId||data.fileId;if(!key||ids.has(key))continue;ids.add(key)
 let path='',metadata:any
 if(data.assetId){const row=await context.client.from('project_space_assets').select('*').eq('id',key).eq('space_id',space).maybeSingle();if(!row.data)continue;path=row.data.path;metadata=openSharedVault(row.data.encrypted_data,sharedSecret(event),`space-asset:${space}:${key}`,1)}
 else{try{const docs=await readProjectDocuments(event,key);path=docs.rows[0]!.path;const f=docs.files[0]!;metadata={name:f.name,type:f.type,size:f.size,description:f.description,tags:f.tags}}catch{continue}}
 const bytes=await context.client.storage.from(projectDocumentBucket).download(path);if(bytes.error||!bytes.data)throw createError({statusCode:503,message:'Не удалось прочитать вложение'})
 const buffer=Buffer.from(await bytes.data.arrayBuffer());total+=buffer.length;if(total>90*1024*1024)throw createError({statusCode:413,message:'Вложения пространства превышают 90 МБ'})
 entries.push({path:`files/${key}`,bytes:buffer});files.push({id:key,metadata})
 }
 entries.push({path:'space.json',bytes:Buffer.from(JSON.stringify({format:'magnat-space-v1',projectId:project,name:board.data.name,description:board.data.description,objects:objects.data,files}))})
 setHeaders(event,{'Content-Type':'application/zip','Content-Disposition':"attachment; filename*=UTF-8''space.zip"})
 return writeDocumentArchive(entries)
})
