import { z } from 'zod'
import type { H3Event } from 'h3'
import type { TeamUnit, TeamPerson, TeamProfile } from '../../shared/types/team'
import { normalizeTelegram, normalizePeopleQuery } from '../../shared/utils/team'
export const profileSchema = z.object({ fullName: z.string().trim().min(2).max(120), workEmail: z.union([z.email().max(254),z.literal('')]), telegram: z.string().max(120).transform((value,context) => { try { return normalizeTelegram(value) } catch { context.addIssue({code:'custom',message:'Некорректный Telegram'}); return z.NEVER } }) }).strict()
export const unitSchema = z.object({ id:z.uuid().optional(), name:z.string().trim().min(1).max(80), kind:z.enum(['company','department','role']), parentId:z.uuid().nullable(), brand:z.enum(['magnat','light']).nullable().optional() }).strict()
type Context = Awaited<ReturnType<typeof requireSharedUser>>
export async function teamUnits(context:Context):Promise<TeamUnit[]> {
 const {data,error}=await context.client.from('team_units').select('*').order('name')
 if(error)throw createError({statusCode:503,message:'Не удалось загрузить структуру команды'})
 return data.map(row=>({id:row.id,parentId:row.parent_id,name:row.name,kind:row.kind,brand:row.brand}))
}
export async function teamPeople(context:Context,rows:any[]):Promise<TeamPerson[]> {
 const paths=[...new Set(rows.map(row=>row.avatar_path).filter(Boolean))] as string[],urls=new Map<string,string>()
 if(paths.length){const {data}=await context.client.storage.from('profile-avatars').createSignedUrls(paths,3600);for(const item of data??[])if(item.signedUrl&&item.path){const url=new URL(item.signedUrl);urls.set(item.path,`/supabase${url.pathname}${url.search}`)}}
 return rows.map(row=>({isHidden:!!row.is_hidden,id:row.user_id,fullName:row.full_name,email:row.account_email,workEmail:row.work_email,telegram:row.telegram,brand:row.brand,avatarUrl:urls.get(row.avatar_path)??'',roleIds:row.role_ids??[],commonVaultCount:Number(row.common_vault_count??0)}))
}
export async function teamDirectory(context:Context,query:string,page=1,company:string|null=null,limit=50,includeHidden=false){
 const {data,error}=await context.client.rpc('search_team',{p_actor:context.user.id,p_query:normalizePeopleQuery(query),p_limit:limit,p_offset:(page-1)*limit,p_company:company,p_include_hidden:includeHidden})
 if(error)throw createError({statusCode:503,message:'Не удалось найти участников'})
 return {people:await teamPeople(context,data??[]),total:Number(data?.[0]?.total??0),page}
}
export async function teamProfile(_event:H3Event,context:Context,id:string):Promise<TeamProfile>{
 const [{data:profile,error},{data:assignments,error:assignmentError},units,{data:vaults,error:vaultError},{data:ownAssignments,error:ownError}]=await Promise.all([
  context.client.from('team_profiles').select('*').eq('user_id',id).maybeSingle(),context.client.from('team_role_assignments').select('role_id').eq('user_id',id),teamUnits(context),context.client.rpc('team_common_vaults',{p_actor:context.user.id,p_target:id}),context.client.from('team_role_assignments').select('role_id').eq('user_id',context.user.id)
 ])
 if(error||assignmentError||vaultError||ownError)throw createError({statusCode:503,message:'Не удалось загрузить профиль'})
 if(!profile)throw createError({statusCode:404,message:'Участник не найден'})
 const roleIds=(assignments??[]).map(item=>item.role_id),mine=new Set<string>(),theirs=new Set<string>(),lookup=new Map(units.map(unit=>[unit.id,unit]))
 function ancestors(ids:string[],target:Set<string>){for(const id of ids){let unit=lookup.get(id);const visited=new Set<string>();while(unit&&!visited.has(unit.id)){visited.add(unit.id);target.add(unit.id);unit=unit.parentId?lookup.get(unit.parentId):undefined}}}
 ancestors((ownAssignments??[]).map(item=>item.role_id),mine);ancestors(roleIds,theirs)
 if(!ownAssignments?.length)for(const unit of units)if(unit.kind==='company'&&unit.brand===(context.user.user_metadata?.account_brand==='light'?'light':'magnat'))mine.add(unit.id)
 if(!roleIds.length)for(const unit of units)if(unit.kind==='company'&&unit.brand===profile.brand)theirs.add(unit.id)
 const [person]=await teamPeople(context,[{...profile,role_ids:roleIds}])
 return {person:person!,units,commonUnits:[...mine].filter(id=>theirs.has(id)),commonVaults:(vaults??[]).map((row:any)=>({id:row.id,name:row.name,role:row.member_role,owner:row.owner}))}
}
export async function requireVaultManager(context:Awaited<ReturnType<typeof requireSharedMember>>,targetId?:string,nextRole?:string){
 if(context.row.owner_id===context.user.id)return
 if(context.membership.member_role!=='manager'||nextRole==='manager'||targetId===context.row.owner_id||targetId===context.user.id)throw createError({statusCode:403,message:'Недостаточно прав для управления участниками'})
 if(targetId){const{data,error}=await context.client.from('shared_vault_members').select('member_role').eq('vault_id',context.id).eq('user_id',targetId).maybeSingle();if(error||!data||data.member_role==='manager')throw createError({statusCode:403,message:'Права администратора меняет владелец'})}
}
