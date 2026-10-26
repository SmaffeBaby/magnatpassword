import { teamProfile } from '../../utils/team'
export default defineEventHandler(async event=>{const context=await requireSharedUser(event);return teamProfile(event,context,context.user.id)})
