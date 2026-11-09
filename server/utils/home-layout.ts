import { z } from 'zod'
import { HOME_APP_IDS } from '../../shared/types/home-layout'

export const homeLayoutSchema = z.object({
  version: z.literal(1),
  rows: z.array(z.object({ align: z.enum(['left', 'center', 'right']), cards: z.array(z.enum(HOME_APP_IDS)).min(1).max(HOME_APP_IDS.length) }).strict()).max(HOME_APP_IDS.length),
  hidden: z.array(z.enum(HOME_APP_IDS)).max(HOME_APP_IDS.length)
}).strict().refine(layout => {
  const ids = [...layout.rows.flatMap(row => row.cards), ...layout.hidden]
  return ids.length === HOME_APP_IDS.length && new Set(ids).size === HOME_APP_IDS.length
}, 'Every application must appear exactly once')
