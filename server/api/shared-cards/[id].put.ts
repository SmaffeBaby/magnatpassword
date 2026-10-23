import {assertNewCardAccess} from '../../utils/category-access'
import {entryCategoryIds} from '../../../shared/utils/credentials'
export default defineEventHandler(async event=>{
 const context=await requireCard(event),body=await sharedBody(event,cardInputSchema.omit({origin:true}).extend({revision:revisionSchema}))
 if(body.entry.id!==context.card.entry.id)throw createError({statusCode:400,message:'Нельзя изменить идентификатор карточки'})
 if(!context.card.canManageCategories&&JSON.stringify([...entryCategoryIds(body.entry)].sort())!==JSON.stringify([...entryCategoryIds(context.card.entry)].sort()))throw createError({statusCode:403,message:'Категории карточки меняет участник с полным доступом'})
 if(body.vaultIds)assertNewCardAccess(body.entry,body.vaultIds,context.access)
 if(body.vaultIds&&!context.card.canManageSharing)throw createError({statusCode:403,message:'Только создатель карточки с доступом ко всем её хранилищам может изменить состав хранилищ'})
 return mutateCard(context,context.id,body.revision,{encryptedData:sealCard(event,context.id,body.entry,context.card.payments),...(body.vaultIds?{vaultIds:[...new Set(body.vaultIds)]}:{})})
})
