import { defineStore } from 'pinia'
import type { TeamProfile,TeamDirectory } from '~~/shared/types/team'
export const useTeamStore=defineStore('team',()=>{
 const queries=useAccountQueries(),auth=useAuthStore(),me=ref<TeamProfile|null>(null),busy=ref(false),error=ref('')
 let generation=0
 const message=(failure:any)=>failure?.data?.message||failure?.message||'Не удалось загрузить команду'
 async function refreshMe(force=false){if(!auth.user)return;const attempt=generation;try{const profile=await queries.read<TeamProfile>('profile','/api/profile',{force,staleTime:300000});if(attempt===generation){me.value=profile;error.value=''}}catch(failure){if(attempt===generation)error.value=message(failure)}}
 async function profile(id?:string,force=false){const attempt=generation;const result=await queries.read<TeamProfile>(id?'team-profile':'profile',id?`/api/team/${id}`:'/api/profile',{force});if(attempt===generation&&(!id||id===auth.user?.id))me.value=result;return result}
 async function directory(query:string,page:number,company='',force=false){const params=new URLSearchParams({q:query,page:String(page)});if(company)params.set('company',company);return queries.read<TeamDirectory>('team',`/api/team?${params}`,{force})}
 async function change(action:()=>Promise<TeamProfile>){if(busy.value)return false;const attempt=generation;busy.value=true;error.value='';try{const result=await action();if(attempt!==generation)return false;await queries.invalidate('profile','team','team-profile','team-search','admin-team-search','workspace');if(attempt!==generation)return false;me.value=result;queries.set('profile','/api/profile',result);return true}catch(failure){if(attempt===generation)error.value=message(failure);return false}finally{if(attempt===generation)busy.value=false}}
 const save=(body:{fullName:string;workEmail:string;telegram:string})=>change(()=>sharedRequest<TeamProfile>('/api/profile',{method:'PUT',body}))
 const avatar=(file:File)=>{const body=new FormData();body.append('avatar',file);return change(()=>sharedRequest<TeamProfile>('/api/profile/avatar',{method:'POST',body}))}
 const removeAvatar=()=>change(()=>sharedRequest<TeamProfile>('/api/profile/avatar',{method:'DELETE'}))
 function lock(){generation++;me.value=null;busy.value=false;error.value=''}
 return {me,busy,error,refreshMe,profile,directory,save,avatar,removeAvatar,lock}
})
