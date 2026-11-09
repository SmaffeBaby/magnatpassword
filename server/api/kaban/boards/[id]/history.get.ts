import { z } from 'zod'
import { kabanId,kabanFailure,readKabanTaskData } from '../../../../utils/kaban'
import { openSharedVault } from '../../../../utils/shared-crypto'
import { teamPeople } from '../../../../utils/team'
import type { KabanFile } from '../../../../../shared/types/kaban'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),id=kabanId(event),query=getQuery(event)
 const before=query.before===undefined?null:z.coerce.number().int().positive().safeParse(query.before)
 if(before!==null&&!before.success)throw createError({statusCode:400,message:'Некорректная страница истории.'})
 const {data,error}=await context.client.rpc('kaban_history',{p_actor:context.user.id,p_board:id,p_before:before===null?null:before.data})
 if(error)kabanFailure(error)
 const rows=(data??[]).slice(0,50),ids=[...new Set<string>(rows.map((row:any)=>row.actor_id).filter(Boolean))]
 const profiles=ids.length?await context.client.from('team_profiles').select('*').in('user_id',ids):{data:[],error:null}
 if(profiles.error)kabanFailure(profiles.error)
 const people=await teamPeople(context,profiles.data??[])
 const events=rows.map((row:any)=>{
  const a=row.before_data,b=row.after_data,details:string[]=[];let label='Изменение доски'
  if(row.entity==='task'){
   const previous=a?readKabanTaskData(event,a):null,next=b?readKabanTaskData(event,b):null,name=next?.title||previous?.title||'Задача'
   label=`${row.action==='INSERT'?'Создана задача':row.action==='DELETE'?'Удалена задача':a.archived!==b.archived?(b.archived?'Задача закрыта':'Задача восстановлена'):'Изменена задача'}: ${name}`
   if(previous&&next){for(const [key,title] of [['title','Название'],['description','Описание'],['dueOn','Срок'],['todos','To-do список']] as const){if(JSON.stringify(previous[key])!==JSON.stringify(next[key]))details.push(key==='dueOn'?`Срок: ${previous.dueOn||'не задан'} → ${next.dueOn||'не задан'}`:`Изменено: ${title}`)}if(a.stage_id!==b.stage_id)details.push('Перемещение в другую стадию');if(JSON.stringify(a.category_ids)!==JSON.stringify(b.category_ids))details.push('Перемещение в другую категорию');if(JSON.stringify(a.participant_ids)!==JSON.stringify(b.participant_ids))details.push('Изменены участники');for(const item of next.todos){const old=previous.todos.find(todo=>todo.id===item.id);if(!old)details.push('Добавлен пункт: '+item.text);else{if(old.text!==item.text)details.push('Пункт: '+old.text+' → '+item.text);if(old.done!==item.done)details.push((item.done?'Выполнен пункт: ':'Возвращён в работу пункт: ')+item.text)}}for(const item of previous.todos)if(!next.todos.some(todo=>todo.id===item.id))details.push('Удалён пункт: '+item.text)}
  }else if(row.entity==='category'){
   label=`${row.action==='INSERT'?'Создана категория':a?.archived!==b?.archived?(b?.archived?'Категория закрыта':'Категория восстановлена'):'Изменена категория'}: ${b?.name||a?.name}`
   if(a&&b){if(a.name!==b.name)details.push(`${a.name} → ${b.name}`);if(a.parent_id!==b.parent_id)details.push('Изменена родительская категория');if(a.color!==b.color)details.push('Изменён цвет')}
  }else if(row.entity==='file'){
   const file=openSharedVault<KabanFile>((b||a).encrypted_data,sharedSecret(event),`kaban-file:${row.task_id}:${row.entity_id}`,1)
   label=`${row.action==='INSERT'?'Добавлен файл':'Удалён файл'}: ${file.name}`
  }else label='Изменены стадии доски'
  return {id:String(row.id),createdAt:row.created_at,actor:people.find(person=>person.id===row.actor_id)||null,label,details}
 })
 return {events,nextBefore:data?.length>50?String(rows[rows.length-1].id):null}
})
