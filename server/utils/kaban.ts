import { activityChanges } from '../../shared/utils/kaban-activity'
import { z } from 'zod'
import type { H3Event } from 'h3'
import type { KabanTaskData, KabanFile } from '../../shared/types/kaban'
import { validDate } from '../../shared/utils/subscriptions'
import { kabanCanEditPlanning, kabanPlanningChanged, kabanBlocks, kabanBlockSummary, kabanLink } from '../../shared/utils/kaban'
import { openSharedVault, sealSharedVault } from './shared-crypto'

const todoSchema = z.array(z.object({ id:z.uuid(),text:z.string().trim().min(1).max(500),done:z.boolean() }).strict()).max(100).refine(items=>new Set(items.map(item=>item.id)).size===items.length)
const blockBase={id:z.uuid(),title:z.string().trim().min(1).max(120)}
export const kabanBlocksSchema=z.array(z.discriminatedUnion('type',[
 z.object({...blockBase,type:z.literal('description'),value:z.string().max(20000)}).strict(),
 z.object({...blockBase,type:z.literal('link'),value:z.string().max(2048).refine(value=>!value||!!kabanLink(value))}).strict(),
 z.object({...blockBase,type:z.literal('password'),vaultId:z.union([z.literal('personal'),z.uuid()]),entryId:z.union([z.literal(''),z.uuid()])}).strict(),
 z.object({...blockBase,type:z.literal('todo'),items:todoSchema}).strict(),
 z.object({...blockBase,type:z.literal('files')}).strict()
])).max(40).refine(blocks=>new Set(blocks.map(block=>block.id)).size===blocks.length).refine(blocks=>{const summary=kabanBlockSummary(blocks);return summary.description.length<=20000&&summary.todos.length<=100&&new Set(summary.todos.map(item=>item.id)).size===summary.todos.length})
export const kabanDataSchema=z.object({title:z.string().trim().min(1).max(200),description:z.string().max(20000),dueOn:z.string().refine(value=>!value||validDate(value)),todos:todoSchema,blocks:kabanBlocksSchema.optional()}).strict()
export const kabanTaskSchema = z.object({ boardId: z.uuid(), stageId: z.uuid(), participantIds: z.array(z.uuid()).max(50), closerIds: z.array(z.uuid()).max(50).optional(), categoryIds: z.array(z.string().min(1).max(128)).min(1).max(50), data: kabanDataSchema }).strict()
export const kabanStagesSchema = z.array(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(60), color: z.string().regex(/^#[\da-fA-F]{6}$/), done: z.boolean() }).strict()).min(1).max(12).refine(stages => new Set(stages.map(stage => stage.id)).size === stages.length)
export const kabanBucket = 'kaban-files'
export function kabanFailure(error: { message: string }) {
  const text = error.message
  if (text.includes('INVALID_YEAR')) throw createError({statusCode:400,message:'Выберите доступный год.'})
  if (text.includes('INVALID_RETENTION')) throw createError({statusCode:400,message:'Укажите срок хранения от 1 до 1000 дней, месяцев или лет.'})
  if (text.includes('CREATOR_COMPLETION_ONLY')) throw createError({ statusCode: 403, message: 'Завершать задачу может создатель или выбранные им пользователи.' })
  if (text.includes('CREATOR_ONLY')) throw createError({ statusCode: 403, message: 'Это действие доступно только создателю задачи.' })
  if (text.includes('ACCESS_DENIED')) throw createError({ statusCode: 403, message: 'Нет прав на действие в этом хранилище.' })
  if (text.includes('REVISION_CONFLICT')) throw createError({ statusCode: 409, message: 'Данные изменились. Обновите доску и повторите действие.' })
  if (text.includes('KABAN_NOT_FOUND')) throw createError({ statusCode: 404, message: 'Задача или доска не найдена.' })
  if (text.includes('STAGE_IN_USE')) throw createError({ statusCode: 400, message: 'Сначала перенесите задачи из удаляемой стадии.' })
  if (text.includes('INVALID_PARTICIPANT')) throw createError({ statusCode: 400, message: 'Ответственные должны иметь доступ к хранилищу и категориям задачи.' })
  if (text.includes('INVALID_CATEGORY')) throw createError({ statusCode: 400, message: 'Выберите открытую категорию Кабана. Проверьте вложенность подкатегорий.' })
  if (text.includes('CATEGORY_ARCHIVED')) throw createError({ statusCode: 400, message: 'Сначала восстановите родительскую категорию.' })
  if (text.includes('INVALID_STAGE')) throw createError({ statusCode: 400, message: 'Стадия больше не существует. Обновите доску.' })
  if (text.includes('FILE_LIMIT')) throw createError({ statusCode: 400, message: 'К задаче можно прикрепить до 20 файлов.' })
  if (text.includes('TASK_LIMIT')) throw createError({ statusCode: 400, message: 'Достигнут предел в 5000 задач на доске.' })
  throw createError({ statusCode: 503, message: 'Не удалось сохранить или загрузить доску.' })
}
export function kabanId(event: H3Event, name = 'id') { const value = z.uuid().safeParse(getRouterParam(event, name)); if (!value.success) throw createError({ statusCode: 400, message: 'Некорректный идентификатор.' }); return value.data }
export async function writeKabanTask(event: H3Event, id: string, create = false) {
  const context = await requireSharedUser(event)
  const schema = kabanTaskSchema.extend({ revision: create ? z.literal(0) : z.number().int().positive() }).strict()
  const body = await sharedBody(event, schema)
  const permission = await context.client.rpc('kaban_check', { p_actor: context.user.id, p_board: body.boardId, p_write: true })
  if (permission.error) kabanFailure(permission.error)
  let activityPrevious:KabanTaskData|null=null
  if (!create) {
    const current = await context.client.rpc('kaban_task_access', { p_actor: context.user.id, p_task: id, p_write: true, p_board: body.boardId })
    if (current.error) kabanFailure(current.error)
    const row = current.data
    const previous=kabanDataSchema.parse(openSharedVault(row.encrypted_data,sharedSecret(event),`kaban-task:${id}`,1))
    activityPrevious=previous
    if(previous.blocks&&!body.data.blocks){
      if(previous.description!==body.data.description||JSON.stringify(previous.todos)!==JSON.stringify(body.data.todos))throw createError({statusCode:409,message:'Задача использует новые поля. Обновите приложение перед редактированием.'})
      body.data.blocks=previous.blocks
    }
    if (row.revision !== body.revision) kabanFailure({ message: 'REVISION_CONFLICT' })
    if (!kabanCanEditPlanning(context.user.id, { creatorId: row.creator_id })) {
      if ((body.closerIds && (body.closerIds.length !== row.closer_ids.length || body.closerIds.some(value => !row.closer_ids.includes(value)))) || kabanPlanningChanged({ dueOn: readKabanTaskData(event, row).dueOn, participantIds: row.participant_ids }, { dueOn: body.data.dueOn, participantIds: body.participantIds })) {
        throw createError({ statusCode: 403, message: 'Только создатель задачи может менять срок и ответственных.' })
      }
    }
    // The mutation checks this same revision under a row lock, so concurrent edits cannot bypass this comparison.
  }
  if(body.data.blocks)Object.assign(body.data,kabanBlockSummary(body.data.blocks))
  const { error } = await context.client.rpc('kaban_task_mutate', { p_actor: context.user.id, p_board: body.boardId, p_id: id, p_revision: body.revision, p_payload: { activity:activityChanges(activityPrevious,body.data,id),stageId: body.stageId, participantIds: [...new Set(body.participantIds)], ...(body.closerIds ? { closerIds: [...new Set(body.closerIds)] } : {}), categoryIds: [...new Set(body.categoryIds)], encryptedData: sealSharedVault(body.data, sharedSecret(event), `kaban-task:${id}`, 1) } })
  if (error) kabanFailure(error)
  return { id }
}
export async function readKabanFiles(event: H3Event, write = false) {
  const context = await requireSharedUser(event), task = kabanId(event)
  const { data, error } = await context.client.rpc('kaban_files_access', { p_actor: context.user.id, p_task: task, p_write: write })
  if (error) kabanFailure(error)
  const files: KabanFile[] = (data ?? []).map((row: any) => ({ ...openSharedVault<KabanFile>(row.encrypted_data, sharedSecret(event), `kaban-file:${task}:${row.id}`, 1), id: row.id }))
  return { context, task, files }
}
export function readKabanTaskData(event: H3Event, row: any): KabanTaskData { const data=kabanDataSchema.parse(openSharedVault(row.encrypted_data, sharedSecret(event), `kaban-task:${row.id}`, 1));return {...data,blocks:kabanBlocks(data,row.id)} }
export function kabanImageType(bytes: Uint8Array): string {
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) return 'image/png'
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 16 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'image/webp'
  if (bytes.length >= 13 && /^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0,6)))) return 'image/gif'
  return ''
}
