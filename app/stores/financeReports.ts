import { defineStore } from 'pinia'
import type { FinanceReportRequest, FinanceReportSummary } from '~~/shared/types/finance-reports'

export const useFinanceReportsStore = defineStore('finance-reports', () => {
  const items=ref<FinanceReportSummary[]>([]),total=ref(0),page=ref(1)
  const loading=ref(false),generating=ref(false),deletingId=ref(''),downloadingIds=ref<string[]>([]),error=ref('')
  let generation=0,loadSequence=0
  const pages=computed(()=>Math.max(1,Math.ceil(total.value/20)))
  const message=(failure:any)=>failure?.data?.message||failure?.message||'Отчёты недоступны'
  async function refresh(nextPage=page.value){
    if(!useVaultStore().unlocked)return
    const attempt=generation,sequence=++loadSequence
    loading.value=true;error.value=''
    try{
      const result=await sharedRequest<{items:FinanceReportSummary[];total:number}>(`/api/finance-reports?page=${nextPage}`)
      if(attempt!==generation||sequence!==loadSequence)return
      items.value=result.items;total.value=result.total;page.value=nextPage
    }catch(failure){if(attempt===generation&&sequence===loadSequence)error.value=message(failure)}
    finally{if(attempt===generation&&sequence===loadSequence)loading.value=false}
  }
  async function generate(request:FinanceReportRequest){
    if(generating.value||!useVaultStore().unlocked)return null
    const attempt=generation;generating.value=true;error.value=''
    try{
      const report=await sharedRequest<FinanceReportSummary>('/api/finance-reports',{method:'POST',body:request})
      if(attempt!==generation)return null
      await refresh(1)
      return attempt===generation?report:null
    }catch(failure){if(attempt===generation)error.value=message(failure);return null}
    finally{if(attempt===generation)generating.value=false}
  }
  async function download(report:FinanceReportSummary){
    if(downloadingIds.value.includes(report.id)||!useVaultStore().unlocked)return false
    const attempt=generation;downloadingIds.value.push(report.id);error.value=''
    try{
      const {data}=await useNuxtApp().$supabase.auth.getSession()
      if(!data.session)throw new Error('Войдите в аккаунт')
      const pdf=await $fetch<Blob>(`/api/finance-reports/${report.id}`,{responseType:'blob',headers:{Authorization:`Bearer ${data.session.access_token}`}})
      if(attempt!==generation)return false
      const url=URL.createObjectURL(pdf),link=document.createElement('a')
      link.href=url;link.download=report.filename;document.body.appendChild(link);link.click();link.remove()
      window.setTimeout(()=>URL.revokeObjectURL(url),10000)
      return true
    }catch(failure){if(attempt===generation)error.value=message(failure);return false}
    finally{if(attempt===generation)downloadingIds.value=downloadingIds.value.filter(id=>id!==report.id)}
  }
  async function remove(report:FinanceReportSummary){
    if(deletingId.value||!useVaultStore().unlocked)return false
    const attempt=generation;deletingId.value=report.id;error.value=''
    try{
      await sharedRequest(`/api/finance-reports/${report.id}`,{method:'DELETE'})
      if(attempt!==generation)return false
      const nextPage=items.value.length===1&&page.value>1?page.value-1:page.value
      await refresh(nextPage)
      return attempt===generation
    }catch(failure){if(attempt===generation)error.value=message(failure);return false}
    finally{if(attempt===generation)deletingId.value=''}
  }
  function lock(){generation++;loadSequence++;items.value=[];total.value=0;page.value=1;loading.value=false;generating.value=false;deletingId.value='';downloadingIds.value=[];error.value=''}
  return {items,total,page,pages,loading,generating,deletingId,downloadingIds,error,refresh,generate,download,remove,lock}
})
