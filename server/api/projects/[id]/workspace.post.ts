import {requireProjectsUser,projectId,projectFailure} from '../../../utils/projects'
import { z } from 'zod'
import { projectProfileSchema } from '../../../../shared/utils/project-workspace'
export default defineEventHandler(async event => {
 const context = await requireProjectsUser(event), id = projectId(event)
 const body = await sharedBody(event, z.discriminatedUnion('action', [
  z.object({action:z.literal('profile'),revision:z.number().int().positive(),data:projectProfileSchema}).strict(),
  z.object({action:z.literal('favorite'),data:z.object({favorite:z.boolean()}).strict()}).strict(),
  z.object({action:z.literal('move'),data:z.object({folderId:z.uuid().nullable()}).strict()}).strict(),
  z.object({action:z.literal('archive'),revision:z.number().int().positive(),data:z.object({archived:z.boolean()}).strict()}).strict(),
  z.object({action:z.enum(['duplicate','delete']),revision:z.number().int().positive()}).strict(),
  z.object({action:z.literal('kind'),revision:z.number().int().positive(),data:z.object({userId:z.uuid(),kind:z.enum(['executor','observer'])}).strict()}).strict()
 ]))
 const result = await context.client.rpc('project_workspace_action', {p_actor:context.user.id,p_id:id,p_revision:'revision' in body?body.revision:0,p_action:body.action,p_data:'data' in body?body.data:{}})
 if(result.error)projectFailure(result.error)
 return result.data
})
