import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), body = await sharedBody(event,z.object({format:z.enum(['xlsx','pdf']),isOwnLegalEntity:z.boolean()}).strict())
  const companies = (await listProjectCompanies(event,context)).filter(party => party.isOwnLegalEntity === body.isOwnLegalEntity)
  const file = await renderEstimate({target:'counterparties',counterparties:companies,counterpartyTitle:body.isOwnLegalEntity?'НАШИ ЮР. ЛИЦА':'КОНТРАГЕНТЫ',details:{notice:'',counterpartyNote:''}},body.format)
  setHeader(event,'Content-Type',body.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event,'Content-Disposition',`attachment; filename="${body.isOwnLegalEntity?'legal-entities':'counterparties'}.${body.format}"`)
  return file
})
