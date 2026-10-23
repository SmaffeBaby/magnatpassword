import type {CredentialAccount} from '~~/shared/types/vault'
import {generatePassword} from '~~/shared/utils/crypto'
export function useAccountEditor(props:{account:CredentialAccount}){
 const revealed=ref(false)
 function generate(){props.account.password=generatePassword();revealed.value=true}
 return {revealed,generate}
}
