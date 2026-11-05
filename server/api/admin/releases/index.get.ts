import { readReleasePlan } from '../../../utils/release-plan'
export default defineEventHandler(async event => {
  await requireSiteAdmin(event)
  return { plan: await readReleasePlan(event) }
})
