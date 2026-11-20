export function useKabanDirectoryNavigation(){
 const search=useState('kaban-project-search',()=>''),folder=useState('kaban-project-folder',()=> 'all')
 return {search,folder}
}
