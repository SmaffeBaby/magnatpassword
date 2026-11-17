import {requireProjectsUser} from '../../utils/projects'
import { teamUnits } from '../../utils/team'
export default defineEventHandler(async event=>teamUnits(await requireProjectsUser(event)))
