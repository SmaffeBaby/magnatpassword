import { writeKabanCategory } from '../../../utils/kaban-categories'
export default defineEventHandler(event => writeKabanCategory(event, getRouterParam(event,'id') || ''))
