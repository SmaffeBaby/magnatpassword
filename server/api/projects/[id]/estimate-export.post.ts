import { estimateExportSchema, estimateAmounts, estimateFinancials } from '../../../../shared/utils/estimate'
export default defineEventHandler(async event => {
  const estimate = await projectEstimate(event)
  const { format, view, target } = await sharedBody(event, estimateExportSchema)
  const items = estimate.items.filter(item => !view.hiddenRows.includes(item.id))
  const file = await renderEstimate({ ...estimate, target, items, amounts: estimateAmounts(items), financials: estimateFinancials({ items, details: estimate.details }) }, format)
  setHeader(event, 'Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="${target === 'counterparties' ? 'counterparties' : 'estimate'}_${projectId(event)}.${format}"`)
  return file
})
