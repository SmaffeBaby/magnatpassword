import { dashboardWriteSchema } from '../../../../shared/utils/project-dashboard'
export default defineEventHandler(async event => projectDashboard(event, await sharedBody(event, dashboardWriteSchema)))
