export const ACTIVITY_KINDS=['created','completed','updated','moved','checklist','files','restored','deleted'] as const
export type ActivityKind=typeof ACTIVITY_KINDS[number]
export type ActivityFilter='all'|ActivityKind
export type ActivityCounts=Record<ActivityKind,number>
export interface ActivityDay {date:string;total:number;checked:number;kinds:ActivityCounts}
export interface KabanActivity {year:number;today:string;years:number[];vaults:{id:string;name:string}[];days:ActivityDay[]}
export const activityLabels:Record<ActivityKind,string>={created:'Создание задач',completed:'Завершение задач',updated:'Поля и параметры',moved:'Перемещения',checklist:'Работа с to-do',files:'Файлы и фотографии',restored:'Возобновление задач',deleted:'Удаление задач'}
