export default defineEventHandler(async event=>{
 const {context}=await spaceAssetContext(event)
 return (await projectPasswordCandidates(event,context,true)).filter(c=>c.entry.kind==='subscription').map(c=>({source:c.source,title:c.entry.title,sourceName:c.sourceName,subscription:c.entry.financeSubscription?.subscription}))
})
