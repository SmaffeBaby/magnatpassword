import { readKabanFiles } from '../../../../../utils/kaban'
export default defineEventHandler(async event => (await readKabanFiles(event)).files)
