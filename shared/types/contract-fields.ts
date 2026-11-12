export interface ContractField { id:string; label:string; type:'text'|'multiline'|'date'|'money'|'url'|'number'|'checkbox'; value:string }
export interface RegistryReference { origin:'project'|'standalone'; id:string }
