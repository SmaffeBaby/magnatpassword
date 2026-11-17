export function useKabanDirectoryNavigation(){
 const search=useState('kaban-project-search',()=>''),folder=useState('kaban-project-folder',()=> 'all')
 const auth=useAuthStore()
 watch(()=>auth.user?.id,()=>{search.value='';folder.value='all'})
 return {search,folder}
}
