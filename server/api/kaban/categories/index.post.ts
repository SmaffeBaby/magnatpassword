import { randomUUID } from 'node:crypto'
import { writeKabanCategory } from '../../../utils/kaban-categories'
export default defineEventHandler(event => writeKabanCategory(event, randomUUID(), true))
