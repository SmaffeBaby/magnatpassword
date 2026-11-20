import { z } from 'zod'
import { validDate } from './subscriptions'
export const projectStatuses = [{ value: 'planned', label: 'Планируется' }, { value: 'active', label: 'В работе' }, { value: 'paused', label: 'Приостановлен' }, { value: 'completed', label: 'Завершён' }, { value: 'cancelled', label: 'Отменён' }]
const date = z.string().refine(value => !value || validDate(value), 'Некорректная дата')
export const projectAvatarSchema = z.string().max(700000).refine(value => !value || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value))
export const projectProfileSchema = z.object({
 name: z.string().trim().min(1).max(120), status: z.enum(['planned','active','paused','completed','cancelled']),
 startOn: date, endOn: date, description: z.string().max(20000), managerId: z.union([z.literal(''),z.uuid()]),
 avatar: projectAvatarSchema, archived: z.boolean().default(false)
}).strict().refine(value => !value.startOn || !value.endOn || value.startOn <= value.endOn, 'Дата окончания раньше даты начала')
export type ProjectProfile = z.infer<typeof projectProfileSchema>
export function projectProfile(project: { name: string; profile?: Partial<ProjectProfile> }): ProjectProfile {
 return { status:'planned',startOn:'',endOn:'',description:'',managerId:'',avatar:'',archived:false,...project.profile,name:project.name }
}
