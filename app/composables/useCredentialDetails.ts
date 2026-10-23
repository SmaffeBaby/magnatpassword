import type {ScopedCredential} from '~~/shared/utils/vault-sources'
import {credentialAccounts} from '~~/shared/utils/credentials'
import {safeUrl} from '~~/shared/utils/crypto'
export function useCredentialDetails(props:{entry:ScopedCredential|null;open:boolean}){
 const revealed=ref<string[]>([])
 const accounts=computed(()=>props.entry?credentialAccounts(props.entry):[])
 function toggle(id:string){revealed.value=revealed.value.includes(id)?revealed.value.filter(value=>value!==id):[...revealed.value,id]}
 watch(()=>[props.open,props.entry?.id,props.entry?.sharedCardId],()=>{revealed.value=[]})
 return {accounts,revealed,toggle,safeUrl}
}
