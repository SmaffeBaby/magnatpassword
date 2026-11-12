export const HOME_APP_IDS = ['passwords', 'finances', 'relationships', 'projects', 'team', 'kaban', 'contracts'] as const
export type HomeAppId = typeof HOME_APP_IDS[number]
export type HomeAlignment = 'left' | 'center' | 'right'
export interface HomeRow { align: HomeAlignment; cards: HomeAppId[] }
export interface HomeLayout { version: 1; rows: HomeRow[]; hidden: HomeAppId[] }
export interface HomeLayoutResponse { layout: HomeLayout; revision: number }
