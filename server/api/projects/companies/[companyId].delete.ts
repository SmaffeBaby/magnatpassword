import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), id = companyId(event), body = await sharedBody(event,z.object({revision:z.number().int().positive()}).strict())
  await saveProjectCompany(event,context,id,body.revision,{company:'',inn:'',kpp:'',director:'',address:'',bankAccount:''},true)
  return {ok:true}
})
