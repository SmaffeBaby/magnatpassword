export function kabanClosedInRange(closedAt:string|null|undefined,from:string,until:string):boolean {
 if(from&&until&&from>until)return false
 if(!from&&!until)return true
 if(!closedAt)return false
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date(closedAt))
 return (!from||day>=from)&&(!until||day<=until)
}
