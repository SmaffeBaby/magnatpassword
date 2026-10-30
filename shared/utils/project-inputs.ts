import { z } from 'zod'
import { validDate } from './subscriptions'
export const inputFieldSchema = z.object({id:z.uuid(),label:z.string().trim().min(1).max(120),type:z.enum(['text','multiline','url','date','number','checkbox']),value:z.string().max(10000)}).strict().superRefine((field,ctx)=>{
 if (!field.value) return
 const invalid=field.type==='url'?!/^https?:\/\//i.test(field.value)||!URL.canParse(field.value):field.type==='number'?!Number.isFinite(Number(field.value)):field.type==='date'?!validDate(field.value):field.type==='checkbox'?!['true','false'].includes(field.value):false
 if(invalid)ctx.addIssue({code:'custom',message:'Проверьте значение дополнительного поля'})
})
export const inputCardWriteSchema=z.object({revision:z.number().int().min(0),id:z.uuid(),title:z.string().trim().min(1).max(160),description:z.string().max(30000),fields:z.array(inputFieldSchema).max(50)}).strict().refine(data=>new Set(data.fields.map(f=>f.id)).size===data.fields.length,'Повторяющиеся поля')
export const inputDeleteSchema=z.object({revision:z.number().int().min(0),id:z.uuid(),attachmentId:z.uuid().optional()}).strict()
