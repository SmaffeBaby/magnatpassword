import { estimateExportSchema, estimateSnapshot, estimateCell } from '../../../../shared/utils/estimate'
export default defineEventHandler(async event => {
  const estimate = await projectEstimate(event)
  const { format, view } = await sharedBody(event, estimateExportSchema)
  const snapshot = estimateSnapshot(estimate.items, view)
  if (!snapshot.columns.length || !snapshot.rows.length) throw createError({ statusCode: 400, message: 'Выберите хотя бы одну строку и один столбец.' })
  const file = await renderEstimate({ title: estimate.projectName, createdAt: new Date().toISOString(), ...snapshot,
    cells: snapshot.rows.map(item => snapshot.columns.map(column => estimateCell(item, column.key))) }, format)
  setHeader(event, 'Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setHeader(event, 'Content-Disposition', `attachment; filename="estimate_${projectId(event)}.${format}"`)
  return file
})
