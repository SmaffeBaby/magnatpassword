import type {AppRelease} from '../types/releases'
const pattern=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/
export function validAppVersion(value:unknown):value is string{return typeof value==='string'&&value.length<=100&&pattern.test(value)}
export function compareAppVersions(a:string,b:string):number|null{
 if(!validAppVersion(a)||!validAppVersion(b))return null
 const x=pattern.exec(a)!,y=pattern.exec(b)!
 for(let i=1;i<=3;i++){const left=BigInt(x[i]!),right=BigInt(y[i]!);if(left!==right)return left>right?1:-1}
 if(x[4]===y[4])return 0
 if(!x[4])return 1
 if(!y[4])return -1
 const left=x[4].split('.'),right=y[4].split('.')
 for(let i=0;i<Math.max(left.length,right.length);i++){
  if(left[i]===undefined)return -1;if(right[i]===undefined)return 1
  const l=left[i]!,r=right[i]!;if(l===r)continue
  const ln=/^\d+$/.test(l),rn=/^\d+$/.test(r)
  if(ln&&rn)return BigInt(l)>BigInt(r)?1:-1
  if(ln!==rn)return ln?-1:1
  return l>r?1:-1
 }
 return 0
}
export function nativeAppPlatform(agent:string,touchPoints=0):string{
 if(/Android/i.test(agent))return 'android'
 if(/iPhone|iPad|iPod/i.test(agent)||/Mac/i.test(agent)&&touchPoints>1)return 'ios'
 if(/Mac/i.test(agent))return 'macos'
 if(/Windows/i.test(agent))return 'windows'
 return 'unknown'
}
export const appPlatformLabels:Record<string,string>={windows:'Windows',macos:'macOS',android:'Android',ios:'iPhone / iPad',unknown:'Платформа не определена'}
export function nativeUpdateAvailable(installed:string|null,release:AppRelease|null,platform:string,now=Date.now()):boolean{
 if(!installed||!release||compareAppVersions(release.version,installed)!==1)return false
 const download=release.downloads.find(item=>item.platform===platform&&item.url)
 return !!download&&(!download.signingExpiresAt||Date.parse(download.signingExpiresAt)>now)
}
