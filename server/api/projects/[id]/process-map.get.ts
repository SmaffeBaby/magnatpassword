import { projectClosing } from '../../../utils/project-closing'
import { buildProjectProcess } from '../../../../shared/utils/project-process'
export default defineEventHandler(async event=>buildProjectProcess(await projectClosing(event)))
