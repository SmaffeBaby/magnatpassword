export default defineEventHandler(async event => {
  const context = await requireSharedUser(event), rows = await chatRpc(context,'chat_directory',{})
  const ids = [...new Set<string>(rows.flatMap((row:any)=>row.members.map((member:any)=>member.userId)))]
  const {data,error} = ids.length ? await context.client.from('team_profiles').select('*').in('user_id',ids) : {data:[],error:null}
  if(error)throw createError({statusCode:503,message:'Не удалось загрузить участников бесед'})
  const [people, previews] = await Promise.all([teamPeople(context,data??[]),chatRpc(context,'chat_directory_previews',{})])
  const latest = new Map<string,string>(previews.map((item:any)=>{
    const content = decodeChatContent(event,'personal',item.chatId,item.id,item.encryptedData)
    const preview = content.text || (content.poll ? `Голосование: ${content.poll.question}` : content.todo ? `Список дел: ${content.todo.title}` : content.tasks.length ? `Задача: ${content.tasks[0]!.title}` : content.bookings.length ? `Бронь: ${content.bookings[0]!.title}` : content.passwordIds.length || content.passwordCopies.length ? 'Пароль' : 'Вложение')
    return [item.chatId,`${item.authorId===context.user.id?'Вы: ':''}${preview.replace(/\s+/g,' ').trim().slice(0,180)}`]
  }))
  return rows.map((row:any)=>({...row,lastMessagePreview:latest.get(row.id)||'',people:row.members.map((member:any)=>({userId:member.userId,fullName:people.find(person=>person.id===member.userId)?.fullName||'Участник',avatarUrl:people.find(person=>person.id===member.userId)?.avatarUrl||''}))})).sort((a:any,b:any)=>b.updatedAt.localeCompare(a.updatedAt))
})
