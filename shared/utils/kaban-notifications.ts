import type { KabanTaskData } from '../types/kaban'
import { activityChanges } from './kaban-activity'
import { dateLabel } from './subscriptions'

export function kabanNotificationText(row: any, previous: KabanTaskData | null, next: KabanTaskData | null, fileName?: string, personName: (id:string)=>string = ()=> 'Участник') {
 const a=row.before_data,b=row.after_data,details:string[]=[]
 let action='Изменена задача'
 if(row.entity==='file') {action=row.action==='INSERT'?'Добавлен файл':'Удалён файл';details.push(fileName||'Вложение задачи')}
 else if(row.entity==='location') action=row.action==='MOVE'?'Задача перемещена в другое хранилище':'Задача добавлена в другое хранилище'
 else if(row.action==='INSERT') action='Создана задача'
 else if(row.action==='DELETE') action='Удалена задача'
 else if(a&&b){
  if(a.archived!==b.archived) action=b.archived?'Задача закрыта':'Задача восстановлена'
  const meta=row.notification_meta||{},stages=row.stages||[]
  const before=meta.stageBefore||stages.find((s:any)=>s.id===a.stage_id)?.name
  const after=meta.stageAfter||stages.find((s:any)=>s.id===b.stage_id)?.name
  if(before&&after&&before!==after){action='Изменена стадия';details.push(`Стадия: ${before} → ${after}`)}
  if(JSON.stringify(a.category_ids)!==JSON.stringify(b.category_ids))details.push('Изменена категория задачи')
  if(JSON.stringify(a.participant_ids)!==JSON.stringify(b.participant_ids))details.push(`Ответственные: ${(a.participant_ids||[]).map(personName).join(', ')||'не назначены'} → ${(b.participant_ids||[]).map(personName).join(', ')||'не назначены'}`)
  if(JSON.stringify(a.closer_ids)!==JSON.stringify(b.closer_ids))details.push(`Могут завершать: ${(a.closer_ids||[]).map(personName).join(', ')||'только создатель'} → ${(b.closer_ids||[]).map(personName).join(', ')||'только создатель'}`)
  if(previous&&next){
   if(previous.title!==next.title)details.push(`Название: «${previous.title}» → «${next.title}»`)
   if(previous.dueOn!==next.dueOn)details.push(`Срок: ${previous.dueOn?dateLabel(previous.dueOn):'без срока'} → ${next.dueOn?dateLabel(next.dueOn):'без срока'}`)
   const changes=activityChanges(previous,next,row.task_id)
   if(changes.content&&previous.title===next.title)details.push('Изменены поля и материалы задачи')
   if(changes.checklist)details.push('Изменён to-do список')
   if(!details.length&&a.archived===b.archived)return null
  }
 }
 return {action,details}
}
