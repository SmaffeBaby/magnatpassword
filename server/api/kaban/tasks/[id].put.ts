import { kabanId, writeKabanTask } from '../../../utils/kaban'
export default defineEventHandler(event => writeKabanTask(event, kabanId(event)))
