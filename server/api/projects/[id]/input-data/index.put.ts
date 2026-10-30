import { inputCardWriteSchema } from '../../../../../shared/utils/project-inputs'
export default defineEventHandler(async event=>{
 const current=await readProjectInputs(event,true),body=await sharedBody(event,inputCardWriteSchema)
 inputRevision(current.state.revision,body.revision)
 const existing=current.state.cards.find(c=>c.id===body.id),now=new Date().toISOString()
 const card={id:body.id,title:body.title,description:body.description,fields:body.fields,attachments:existing?.attachments??[],createdAt:existing?.createdAt??now,updatedAt:now,createdBy:existing?.createdBy??current.context.user.id}
 return saveProjectInputs(event,current,body.revision,existing?current.state.cards.map(c=>c.id===card.id?card:c):[card,...current.state.cards])
})
