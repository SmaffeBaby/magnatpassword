import { z } from 'zod'
import { teamDirectory } from '../../utils/team'
export default defineEventHandler(async event=>{const context=await requireSharedUser(event),params=z.object({q:z.string().trim().min(2).max(120)}).parse(getQuery(event));return (await teamDirectory(context,params.q,1,null,12)).people})
