import type { VaultSource } from '../types/sharing'
import type { ScopedCredential } from './vault-sources'
import { sourceEntries } from './vault-sources'
import { buildStructureDiagram, type StructureTable, type StructureLink, type StructureView } from './structure-relationships'
import { serviceEntryKey } from './service-map'

export interface StructureMapGroup extends StructureTable {
  services: ScopedCredential[]
  passwords: ScopedCredential[]
  subscriptions: ScopedCredential[]
  children: { id:string; label:string; subtitle:string; kind:StructureTable['kind']; count:number }[]
  connections: { id:string; label:string; subtitle:string; kind:StructureTable['kind']; reasons:string[]; kinds:StructureLink['kind'][]; shared:number }[]
}
const sortEntries=(a:ScopedCredential,b:ScopedCredential)=>a.title.localeCompare(b.title,'ru',{numeric:true})||serviceEntryKey(a).localeCompare(serviceEntryKey(b))
const resources=(group:StructureMapGroup)=>[...group.services,...group.passwords,...group.subscriptions]

export function buildStructureMap(sources:VaultSource[],mode:StructureView){
  const entries=sourceEntries(sources,true),lookup=new Map(entries.map(entry=>[serviceEntryKey(entry),entry]))
  const diagram=buildStructureDiagram(sources,mode),categories=mode==='categories'?diagram:buildStructureDiagram(sources,'categories')
  const groups:StructureMapGroup[]=diagram.tables.map(table=>{
    const members=[...new Map(table.rows.flatMap(row=>{const entry=row.entryKey?lookup.get(row.entryKey):undefined;return entry?[[serviceEntryKey(entry),entry] as const]:[]})).values()].sort(sortEntries)
    return {...table,services:members.filter(entry=>entry.kind==='relationship'),passwords:members.filter(entry=>!entry.kind),subscriptions:members.filter(entry=>entry.kind==='subscription'),children:[],connections:[]}
  })
  const byId=new Map(groups.map(group=>[group.id,group]))
  for(const group of groups){
    if(group.kind==='folder'){
      group.children=group.rows.flatMap(row=>{const target=row.categoryKey?byId.get('category:'+row.categoryKey):undefined;return target?[{id:target.id,label:target.label,subtitle:target.subtitle,kind:target.kind,count:resources(target).length}]:[]})
      const members=[...new Map(group.children.flatMap(child=>resources(byId.get(child.id)!).map(entry=>[serviceEntryKey(entry),entry] as const))).values()].sort(sortEntries)
      group.services=members.filter(entry=>entry.kind==='relationship');group.passwords=members.filter(entry=>!entry.kind);group.subscriptions=members.filter(entry=>entry.kind==='subscription')
    }else if(group.kind==='vault'){
      group.children=categories.tables.filter(table=>table.vaultId===group.vaultId).map(table=>({id:table.id,label:table.label,subtitle:table.subtitle,kind:table.kind,count:table.rows.filter(row=>row.entryKey).length}))
    }
  }
  for(const group of groups){
    const connected=new Map<string,{reasons:Set<string>;kinds:Set<StructureLink['kind']>}>()
    for(const link of diagram.links){const id=link.source===group.id?link.target:link.target===group.id?link.source:'';if(!id)continue;const item=connected.get(id)??{reasons:new Set<string>(),kinds:new Set<StructureLink['kind']>()};link.reasons.forEach(reason=>item.reasons.add(reason));item.kinds.add(link.kind);connected.set(id,item)}
    const own=new Set(resources(group).map(serviceEntryKey))
    group.connections=[...connected].flatMap(([id,item])=>{const other=byId.get(id);return other?[{id,label:other.label,subtitle:other.subtitle,kind:other.kind,reasons:[...item.reasons],kinds:[...item.kinds],shared:resources(other).filter(entry=>own.has(serviceEntryKey(entry))).length}]:[]}).sort((a,b)=>b.shared-a.shared||a.label.localeCompare(b.label,'ru'))
  }
  return groups.sort((a,b)=>a.subtitle.localeCompare(b.subtitle,'ru')||a.kind.localeCompare(b.kind)||a.label.localeCompare(b.label,'ru'))
}

export function searchStructureGroups(groups:StructureMapGroup[],query:string,linkedOnly=false){
  const terms=query.toLocaleLowerCase('ru-RU').trim().split(/\s+/).filter(Boolean)
  return groups.filter(group=>{
    if(linkedOnly&&!group.connections.length)return false
    const text=[group.label,group.subtitle,...group.children.map(child=>child.label),...resources(group).map(entry=>`${entry.title} ${entry.url} ${entry.financeSubscription?.label??''}`)].join(' ').toLocaleLowerCase('ru-RU')
    return terms.every(term=>text.includes(term))
  })
}
