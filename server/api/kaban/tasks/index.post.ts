import { randomUUID } from 'node:crypto'
import { writeKabanTask } from '../../../utils/kaban'
export default defineEventHandler(event => writeKabanTask(event, randomUUID(), true))
