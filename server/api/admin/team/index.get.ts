import { teamUnits } from '../../../utils/team'
export default defineEventHandler(async event=>{
 const context=await requireSiteAdmin(event)
 // Accounts are requested by the debounced picker rather than downloading the whole directory.
 return {units:await teamUnits(context)}
})
