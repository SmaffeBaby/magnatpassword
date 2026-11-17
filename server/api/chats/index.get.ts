export default defineEventHandler(async event => {
  const context = await requireSharedUser(event), rows = await chatRpc(context,'chat_directory',{})
  const ids = [...new Set<string>(rows.flatMap((row:any)=>row.members.map((member:any)=>member.userId)))]
  const {data,error} = ids.length ? await context.client.from('team_profiles').select('*').in('user_id',ids) : {data:[],error:null}
  if(error)throw createError({statusCode:503,message:'Не удалось загрузить участников бесед'})
  const people=await teamPeople(context,data??[])
  return rows.map((row:any)=>({...row,people:row.members.map((member:any)=>({userId:member.userId,fullName:people.find(person=>person.id===member.userId)?.fullName||'Участник',avatarUrl:people.find(person=>person.id===member.userId)?.avatarUrl||''}))})).sort((a:any,b:any)=>b.updatedAt.localeCompare(a.updatedAt))
})
