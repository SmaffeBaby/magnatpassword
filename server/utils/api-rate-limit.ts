import type {H3Event} from 'h3'
import {RequestBudget} from '../../shared/utils/request-budget'
const budget=new RequestBudget()
function apply(event:H3Event,key:string,limit:number){
 const wait=budget.take(key,limit,60000)
 if(!wait)return
 const seconds=Math.ceil(wait/1000)
 setHeader(event,'Retry-After',seconds)
 throw createError({statusCode:429,statusMessage:'Too Many Requests',message:`Слишком много запросов. Повторите через ${seconds} сек.`,data:{retryAfterSeconds:seconds}})
}
export function apiIngressLimit(event:H3Event){
 // An office shares one address. Its safety cap must not be the account's normal budget.
 apply(event,`ingress:${getRequestIP(event)||'unknown'}`,12000)
}
export function apiInvalidSessionLimit(event:H3Event){apply(event,`invalid:${getRequestIP(event)||'unknown'}`,60)}
export function apiAccountLimit(event:H3Event,userId:string){
 const resource=getRequestURL(event).pathname.split('/')[2]||'api'
 const read=['GET','HEAD'].includes(event.method)
 const limit=read?(resource==='personal-vault'?60:resource==='kaban'?600:180):120
 apply(event,`account:${userId}:${read?'read':'write'}:${resource}`,limit)
}
