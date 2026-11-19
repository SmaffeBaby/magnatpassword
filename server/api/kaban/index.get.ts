import {projectFailure} from '../../utils/projects'
import { scopeKabanStages } from '../../utils/kaban-stage-scope'
import { z } from 'zod'
import { teamPeople, teamUnits } from '../../utils/team'
import { kabanFailure, readKabanTaskData } from '../../utils/kaban'
import type { KabanStage, KabanTaskDeadlinePreview } from '~~/shared/types/kaban'
import { todayDate } from '~~/shared/utils/subscriptions'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  const project = getQuery(event).project
  if(project && !z.uuid().safeParse(project).success) throw createError({statusCode:400,message:'Некорректный проект'})
  const vault = z.union([z.literal('personal'), z.uuid()]).safeParse(getQuery(event).vault ?? 'personal')
  if (!vault.success) throw createError({ statusCode: 400, message: 'Выберите хранилище.' })
  const { data, error } = project ? await context.client.rpc('kaban_project_load',{p_actor:context.user.id,p_project:String(project)}) : await context.client.rpc('kaban_load', { p_actor: context.user.id, p_vault: vault.data === 'personal' ? null : vault.data })
  if (error) kabanFailure(error)
  scopeKabanStages(data)
  if (project && getQuery(event).summary === 'deadlines') {
    const today = todayDate()
    const stages: KabanStage[] = data.board.stages
    const doneStages = new Set(stages.filter(stage => stage.done).map(stage => stage.id))
    const deadlines: KabanTaskDeadlinePreview[] = []
    for (const row of data.tasks) {
      if (row.archived || doneStages.has(row.stage_id)) continue
      const { title, dueOn, startOn } = readKabanTaskData(event, row)
      if (dueOn && dueOn >= today) deadlines.push({ id: row.id, title, dueOn, startOn, createdAt: row.created_at })
    }
    return deadlines.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id)).slice(0, 3)
  }
  // One-time import of names for categories already referenced by older tasks.
  // Empty password categories are never imported into Kaban.
  if(data.categories?.some((category:any)=>category.legacyId)){
    let legacy:{id:string;name:string}[]=[]
    if(data.board.vaultId){const result=await context.client.from('shared_vaults').select('*').eq('id',data.board.vaultId).single();if(!result.error)legacy=decodeShared(event,result.data).categories}
    else{const row=await personalRow(context);if(row)legacy=openPersonal(event,row).categories}
    for(const category of data.categories.filter((category:any)=>category.legacyId)){
      const name=legacy.find(item=>item.id===category.legacyId)?.name||'Перенесённые задачи'
      const imported=await context.client.from('kaban_categories').update({name,legacy_id:null}).eq('board_id',data.board.id).eq('id',category.id).eq('legacy_id',category.legacyId).select('name')
      if(imported.error)kabanFailure(imported.error)
      if(imported.data?.length)category.name=name
      category.legacyId=null
    }
  }
  let members = [context.user.id]
  if(data.board.projectId){
    const result=await context.client.rpc('list_projects',{p_actor:context.user.id})
    if(result.error)projectFailure(result.error)
    members=(result.data??[]).find((p:any)=>p.id===data.board.projectId)?.members.filter((m:any)=>m.permission!=='hidden'&&m.sections?.tasks!=='hidden'&&m.hasAccess).map((m:any)=>m.userId)||[]
  } else if (data.board.vaultId) {
    const result = await context.client.from('shared_vault_members').select('user_id').eq('vault_id', data.board.vaultId)
    if (result.error) kabanFailure(result.error)
    members = (result.data ?? []).map(row => row.user_id)
  }
  const ids = [...new Set<string>([...members, ...data.tasks.map((row: any) => row.creator_id), ...data.tasks.flatMap((row: any) => [...row.participant_ids, ...row.closer_ids])])]
  const [profiles, assignments, units] = await Promise.all([
    context.client.from('team_profiles').select('*').in('user_id', ids),
    context.client.from('team_role_assignments').select('user_id,role_id').in('user_id', ids), teamUnits(context)
  ])
  if (profiles.error || assignments.error) throw createError({ statusCode: 503, message: 'Не удалось загрузить участников.' })
  const people = await teamPeople(context, (profiles.data ?? []).map(profile => ({ ...profile, role_ids: (assignments.data ?? []).filter(item => item.user_id === profile.user_id).map(item => item.role_id) })))
  return { ...data, people, units, eligibleIds: members, tasks: data.tasks.map((row: any) => ({ ...readKabanTaskData(event, row), id: row.id, boardId: row.board_id, stageId: row.stage_id, categoryStageIds: row.category_stage_ids || {}, creatorId: row.creator_id, participantIds: row.participant_ids, closerIds: row.closer_ids, locations: row.locations, canEdit: data.canEdit, categoryIds: row.category_ids, revision: row.revision, createdAt: row.created_at, closedAt:row.closed_at, updatedAt: row.updated_at, fileCount: Number(row.file_count),archived:row.archived })) }
})
