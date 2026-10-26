import { z } from 'zod'
import { teamDirectory,teamUnits } from '../../utils/team'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),params=z.object({q:z.string().max(120).default(''),page:z.coerce.number().int().min(1).max(10000).default(1),company:z.uuid().optional()}).parse(getQuery(event))
 const [directory,units]=await Promise.all([teamDirectory(context,params.q,params.page,params.company??null),teamUnits(context)])
 return {...directory,units}
})
