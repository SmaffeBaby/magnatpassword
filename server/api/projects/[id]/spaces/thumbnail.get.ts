import {z} from 'zod'
import { spaceSpreadsheetPreviewDefaults, spaceSpreadsheetPreviewSchema } from '../../../../../shared/utils/project-documents'
export default defineEventHandler(async event=>{
 const {context,space}=await spaceAssetContext(event),query=getQuery(event),id=z.uuid().parse(query.file)
 const preview = spaceSpreadsheetPreviewSchema.safeParse({
   sheet: query.sheet,
   rows: query.rows === undefined ? spaceSpreadsheetPreviewDefaults.rows : Number(query.rows),
   columns: query.columns === undefined ? spaceSpreadsheetPreviewDefaults.columns : Number(query.columns)
 })
 if (!preview.success) throw createError({statusCode:400,message:'Некорректные параметры предпросмотра таблицы'})
 let path='',name=''
 if(query.asset==='true'){const row=await context.client.from('project_space_assets').select('*').eq('id',id).eq('space_id',space).maybeSingle();if(row.error||!row.data)throw createError({statusCode:404,message:'Файл недоступен'});path=row.data.path;name=openSharedVault<{name:string}>(row.data.encrypted_data,sharedSecret(event),`space-asset:${space}:${id}`,1).name}
 else{const current=await readProjectDocuments(event,id);path=current.rows[0]!.path;name=current.files[0]!.name}
 const blob=await context.client.storage.from(projectDocumentBucket).download(path);if(blob.error||!blob.data)throw createError({statusCode:404,message:'Файл недоступен'})
 return spaceThumbnail(Buffer.from(await blob.data.arrayBuffer()),name,query.detail==='true',preview.data)
})
