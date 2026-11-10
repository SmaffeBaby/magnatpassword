import {defineStore} from 'pinia'
import {getVersion} from '@tauri-apps/api/app'
import {isTauri} from '@tauri-apps/api/core'
import type {AppRelease} from '~~/shared/types/releases'
import {nativeAppPlatform,nativeUpdateAvailable,validAppVersion,compareAppVersions} from '~~/shared/utils/app-version'
import {isNativeShell} from '~/utils/native-shell'
import {backendFetch} from '~/utils/backend'
export const useAppVersionStore=defineStore('app-version',()=>{
 const native=ref(false),installed=ref<string|null>(null),platform=ref('unknown'),release=ref<AppRelease|null>(null),loading=ref(false),error=ref(''),promptOpen=ref(false),checkedAt=ref('')
 const available=computed(()=>nativeUpdateAvailable(installed.value,release.value,platform.value))
 const outdated=computed(()=>!!installed.value&&!!release.value&&compareAppVersions(release.value.version,installed.value)===1)
 const current=computed(()=>!!installed.value&&!!release.value&&((compareAppVersions(installed.value,release.value.version)??-1)>=0))
 let initialization:Promise<void>|null=null,pending:Promise<void>|null=null
 function initialize():Promise<void>{
  if(!import.meta.client)return Promise.resolve()
  if(!initialization)initialization=readInstalled()
  return initialization
 }
 async function readInstalled(){
  native.value=isNativeShell()
  if(!native.value)return
  platform.value=nativeAppPlatform(navigator.userAgent,navigator.maxTouchPoints)
  // Read the installed binary. The hosted website's build ID is a different version.
  if(isTauri()){try{const version=await getVersion();if(validAppVersion(version))installed.value=version}catch{/* Older shells may not grant the version permission. */}}
  if(!installed.value){
   try{
    const version=new URLSearchParams(location.search).get('appVersion')||sessionStorage.getItem('magnat-installed-app-version')
    if(validAppVersion(version))installed.value=version
   }catch{/* Storage can be disabled. */}
  }
  if(installed.value){try{sessionStorage.setItem('magnat-installed-app-version',installed.value)}catch{}}
 }
 async function check(showPrompt=false){
  await initialize();if(!native.value)return
  if(!pending){
   loading.value=true;error.value=''
   pending=(async()=>{
    try{release.value=await backendFetch<AppRelease>('/api/releases/latest',{cache:'no-store',timeout:10000,retry:0});checkedAt.value=new Date().toISOString()}
    catch(failure:any){release.value=null;promptOpen.value=false;error.value=failure?.statusCode===404?'Обновления пока не опубликованы.':'Не удалось проверить обновления. Проверьте подключение и повторите попытку.'}
    finally{loading.value=false;pending=null}
   })()
  }
  await pending
  if(showPrompt&&available.value)promptOpen.value=true
 }
 function dismiss(){promptOpen.value=false}
 async function downloads(){dismiss();await navigateTo({path:'/downloads',query:platform.value==='unknown'?{}:{platform:platform.value}})}
 return {native,installed,platform,release,loading,error,promptOpen,checkedAt,available,outdated,current,initialize,check,dismiss,downloads}
})
