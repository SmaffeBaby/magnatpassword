import {XMLParser,XMLBuilder,XMLValidator} from 'fast-xml-parser'
const tags=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','linearGradient','radialGradient','stop','clipPath','mask','title','desc','use'])
const attributes=new Set('id viewBox width height x y x1 x2 y1 y2 cx cy r rx ry d points fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity transform gradientTransform gradientUnits offset stop-color stop-opacity clip-path clip-rule mask maskUnits maskContentUnits preserveAspectRatio vector-effect color href xlink:href style'.split(' '))
function safeValue(value:string){return value.length<=60000&&!/(?:javascript|data:|https?:|\/\/|[<>\\])/i.test(value)&&!(/url\s*\(/i.test(value)&&!/^url\(#[a-zA-Z_][\w:.-]*\)$/.test(value))}
export function sanitizeSvg(source:string):string {
 if(!source||source.length>65000||/<!DOCTYPE|<!ENTITY/i.test(source)||XMLValidator.validate(source)!==true)return ''
 try{
  const parsed=new XMLParser({preserveOrder:true,ignoreAttributes:false,ignoreDeclaration:true,ignorePiTags:true,parseTagValue:false,processEntities:true}).parse(source)
  function clean(nodes:any[],text=false):any[]{return nodes.flatMap<any>(node=>{
   const tag=Object.keys(node).find(key=>key!==':@')
   if(tag==='#text')return text?[{'#text':String(node[tag]).slice(0,200)}]:[]
   if(!tag||!tags.has(tag))return []
   const attrs:Record<string,string>={}
   for(const [name,raw] of Object.entries(node[':@']??{})){
    const key=name.replace(/^@_/,''),value=String(raw)
    if(!attributes.has(key)||!safeValue(value))continue
    if((key==='href'||key==='xlink:href')&&!/^#[a-zA-Z_][\w:.-]*$/.test(value))continue
    if(key==='style'){
     const style=value.split(';').map(part=>part.trim()).filter(part=>/^(fill|fill-rule|fill-opacity|stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-opacity|opacity|stop-color|stop-opacity)\s*:[^;]+$/.test(part)&&safeValue(part.slice(part.indexOf(':')+1).trim())).join(';')
     if(style)attrs[name]=style
    }else attrs[name]=value
   }
   if(tag==='svg'){attrs['@_xmlns']='http://www.w3.org/2000/svg';attrs['@_xmlns:xlink']='http://www.w3.org/1999/xlink'}
   return [{[tag]:clean(Array.isArray(node[tag])?node[tag]:[],tag==='title'||tag==='desc'),':@':attrs}]
  })}
  if(parsed.length!==1||!parsed[0]?.svg)return ''
  return new XMLBuilder({preserveOrder:true,ignoreAttributes:false}).build(clean(parsed))
 }catch{return ''}
}
export const svgImageUrl=(value:string)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(value)
export function validRasterImage(value:string):boolean {
 return /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)&&value.length<360000&&(value.startsWith('data:image/png;base64,iVBORw0KGgo')||value.startsWith('data:image/jpeg;base64,/9j/'))
}
