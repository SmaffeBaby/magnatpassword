import { projectClosing } from '../../../utils/project-closing'
import { projectTimeline } from '../../../../shared/utils/project-timeline'
export default defineEventHandler(async event=>projectTimeline(await projectClosing(event)))
