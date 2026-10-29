import { estimateExportSchema, estimateAmounts, estimateFinancials } from '../../../../shared/utils/estimate'
export default defineEventHandler(async event => {
  const estimate = await projectEstimate(event)
  const { format, view, target, companyKind } = await sharedBody(event, estimateExportSchema)
  const items = estimate.items.filter(item => !view.hiddenRows.includes(item.id))
  const counterparties = target === 'counterparties' && companyKind !== 'all' ? estimate.counterparties.filter(party => !!party.isOwnLegalEntity === (companyKind === 'legal-entities')) : estimate.counterparties
  const file = await renderEstimate({ ...estimate, counterparties, counterpartyTitle: companyKind === 'legal-entities' ? 'НАШИ ЮР. ЛИЦА' : undefined, target, items, amounts: estimateAmounts(items), financials: estimateFinancials({ items, details: estimate.details }) }, format)
  setHeader(event, 'Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${target === 'counterparties' ? 'counterparties' : 'estimate'}_${projectId(event)}.${format}"`)
  return file
})
