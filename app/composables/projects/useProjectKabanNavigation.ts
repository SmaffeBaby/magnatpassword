import type { KabanCategory } from '~~/shared/types/kaban'
type View = 'board' | 'closed' | 'history' | 'categories'
export function useProjectKabanNavigation() {
 const state=useState('project-kaban-navigation',()=>({projectId:'',view:'board' as View,selectedCategory:'all',onlyMine:false,onlyOverdue:false,canEdit:false,categories:[] as (KabanCategory & {count:number})[],createCategory:0}))
 function select(view:View,category='all',mine=false,overdue=false){Object.assign(state.value,{view,selectedCategory:category,onlyMine:mine,onlyOverdue:overdue})}
 return {state,select}
}
