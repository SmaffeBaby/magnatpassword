import type {ScopedCredential} from '~~/shared/utils/vault-sources'
import {safeUrl} from '~~/shared/utils/crypto'
export function useCredentialTile(props:{entry:ScopedCredential}){
 const groups=computed(()=>props.entry.vaultNames??[props.entry.vaultName])
 const domain=computed(()=>{try{return new URL(props.entry.url).hostname.replace(/^www\./,'')}catch{return 'Сайт не указан'}})
 return {groups,domain,safeUrl}
}
