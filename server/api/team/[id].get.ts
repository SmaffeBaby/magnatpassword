import { z } from 'zod'
import { teamProfile } from '../../utils/team'
export default defineEventHandler(async event=>{const context=await requireSharedUser(event),id=z.uuid().parse(getRouterParam(event,'id'));return teamProfile(event,context,id)})
