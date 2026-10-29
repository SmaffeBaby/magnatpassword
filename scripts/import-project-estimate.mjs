// Explicit local import: keep existing positions, match repeated imports, and back up before writing.
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const [file, projectId] = process.argv.slice(2)
if (!file || !/^[\da-f-]{36}$/i.test(projectId || '')) throw Error('Usage: import-project-estimate.mjs source.xlsx project-uuid')
const email = process.env.ESTIMATE_IMPORT_EMAIL, password = process.env.ESTIMATE_IMPORT_PASSWORD
if (!email || !password) throw Error('Set ESTIMATE_IMPORT_EMAIL and ESTIMATE_IMPORT_PASSWORD')
const supabase = createClient('http://127.0.0.1:8003', process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const login = await supabase.auth.signInWithPassword({ email, password })
if (login.error) throw login.error
const token = login.data.session.access_token
async function request(path, body) {
  const response = await fetch('http://127.0.0.1:3003'+path, { method: body ? 'PUT' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const value = await response.json()
  if (!response.ok) throw Error(value.message || `Import failed: ${response.status}`)
  return value
}
const project = (await request('/api/projects')).find(project => project.id === projectId)
if (!project || project.permission === 'viewer') throw Error('Project is unavailable or read only')
const current = await request(`/api/projects/${projectId}/estimate`)
const workbook = XLSX.read(await fs.readFile(file), { type:'buffer' })
if (!workbook.Sheets['Смета'] || !workbook.Sheets['Контрагенты']) throw Error('Expected Смета and Контрагенты worksheets')
const sheet = workbook.Sheets['Смета']
const rows = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'' })
const partiesRows = XLSX.utils.sheet_to_json(workbook.Sheets['Контрагенты'], { header:1, defval:'' })
const contractRows = workbook.Sheets['Договоры'] ? XLSX.utils.sheet_to_json(workbook.Sheets['Договоры'], { header:1, defval:'' }).slice(3).filter(row => row[1] && row[2] && row[3]) : []
const asDate = value => { const parts = String(value).split('.'); return parts.length === 3 ? parts.reverse().join('-') : '' }
const id = key => { const hash = createHash('sha256').update(projectId+':'+key).digest(); hash[6] = (hash[6] & 15) | 64; hash[8] = (hash[8] & 63) | 128; const hex = hash.toString('hex').slice(0,32); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}` }
const counterparties = [...current.counterparties]
for (const row of partiesRows.slice(3)) {
  if (!row[0] || !/^\d{10,12}$/.test(String(row[1]))) continue
  const found = counterparties.find(party => party.inn === String(row[1]) || party.company === String(row[0]))
  const party = { id:found?.id || id('party:'+row[1]), company:String(row[0]), inn:String(row[1]), kpp:String(row[2]), director:String(row[3]), address:String(row[4]), bankAccount:String(row[5]) }
  if (found) counterparties[counterparties.indexOf(found)] = party
  else counterparties.push(party)
}
const items = [...current.items], imported = []
for (const row of rows.slice(9)) {
  if (typeof row[0] !== 'number' || !row[1]) continue
  const party = counterparties.find(party => party.company === row[2]), internalCost = row[2] === 'Внутренние затраты'
  const sourceContract = contractRows.find(contract => contract[2] === row[2] && String(contract[3]).includes('Ромашка'))
  const previous = items.find(item => item.id === id('item:'+row[1]) || item.name === row[1] && item.quantity === row[4] && item.price === row[5] && (!item.counterpartyId || item.counterpartyId === party?.id))
  const item = { id:previous?.id || id('item:'+row[1]), kind:row[3] === 'шт.' ? 'product' : 'service', name:String(row[1]), image:previous?.image || '', link:previous?.link || '', quantity:Number(row[4]), price:Number(row[5]), currency:'RUB', deadline:previous?.deadline || asDate(sourceContract?.[5] || sheet.C7?.v), fields:previous?.fields || [], unit:String(row[3]), counterpartyId:party?.id || '', internalCost, vatRate:Number(row[7]) ? 22 : 0, vatGroup:sourceContract ? String(sourceContract[1]) : '' }
  if (!party && !internalCost) throw Error(`Counterparty is missing for ${item.name}`)
  if (previous) items[items.indexOf(previous)] = item
  else items.push(item)
  imported.push(item)
}
const title = String(sheet.A1?.v || '').split('·')[1]?.split('/')[0]?.trim() || project.name
const details = { title, code:String(sheet.A1?.v || '').split('/').slice(1).join('/').trim(), description:String(sheet.C4?.v || ''), batchQuantity:Number(sheet.C5?.v || 0), clientUnitPrice:Number(sheet.C6?.v || 0), finishDate:asDate(sheet.C7?.v), revenueVatRate:22, notice:String(sheet.A2?.v || ''), notes:[String(sheet.B27?.v || ''), String(sheet.B28?.v || '')].filter(Boolean), counterpartyNote:String(workbook.Sheets['Контрагенты'].A11?.v || '') }
await fs.mkdir('.local', { recursive:true, mode:0o700 })
const backup = `.local/estimate-import-${projectId}-${Date.now()}.json`
await fs.writeFile(backup, JSON.stringify(current), { mode:0o600 })
const result = await request(`/api/projects/${projectId}/estimate`, { revision:current.revision, items, counterparties, details })
for (const format of ['xlsx','pdf']) for (const target of ['estimate','counterparties']) {
  const response = await fetch(`http://127.0.0.1:3003/api/projects/${projectId}/estimate-export`, { method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body:JSON.stringify({format,target,view:{hiddenRows:[],hiddenColumns:[]}}) })
  if (!response.ok) throw Error(`Export check failed: ${response.status}: ${await response.text()}`)
  await fs.writeFile(`.local/${target}-import-check.${format}`,Buffer.from(await response.arrayBuffer()),{mode:0o600})
}
console.log(JSON.stringify({ project:project.name, importedPositions:imported.length, addedPositions:result.items.length-current.items.length, counterparties:result.counterparties.length, addedCounterparties:result.counterparties.length-current.counterparties.length, totalPositions:result.items.length, backup, exportChecks:4 }))
await supabase.auth.signOut({ scope:'local' })
