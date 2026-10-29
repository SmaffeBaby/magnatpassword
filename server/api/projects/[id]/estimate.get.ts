export default defineEventHandler(async event => {
  const { projectName, ...estimate } = await projectEstimate(event)
  return estimate
})
