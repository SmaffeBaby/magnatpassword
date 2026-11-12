import { z } from 'zod'
import { safeUrl } from './crypto'
export const contractFieldsSchema=z.array(z.object({id:z.uuid(),label:z.string().trim().min(1).max(120),type:z.enum(['text','multiline','date','money','url','number','checkbox']),value:z.string().max(10000)}).strict().superRefine((f,c)=>{
 if(!f.value)return
 const invalid=f.type==='date'?!z.iso.date().safeParse(f.value).success:f.type==='money'?!Number.isFinite(Number(f.value))||Number(f.value)<0||Number(f.value)>1e12||Math.abs(Number(f.value)*100-Math.round(Number(f.value)*100))>=0.0001:f.type==='number'?!Number.isFinite(Number(f.value)):f.type==='url'?!safeUrl(f.value):f.type==='checkbox'?!['true','false'].includes(f.value):false
 if(invalid)c.addIssue({code:'custom',message:`Проверьте значение поля «${f.label}»`})
})).max(50).refine(fields=>new Set(fields.map(f=>f.id)).size===fields.length,'Идентификаторы полей не должны повторяться')
export const registryReferenceSchema=z.object({origin:z.enum(['project','standalone']),id:z.uuid()}).strict()
