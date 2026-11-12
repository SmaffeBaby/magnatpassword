// A durable queue keeps failed storage removals retryable after metadata deletion.
export async function cleanupRegistryFiles(context:Awaited<ReturnType<typeof requireProjectsUser>>):Promise<boolean>{
 try{
  const {data,error}=await context.client.from('registry_file_cleanup').select('id,contract_id').limit(100)
  if(error||!data)return false
  if(!data.length)return true
  const removed=await context.client.storage.from('contract-register').remove(data.map(row=>`${row.contract_id}/${row.id}`))
  if(removed.error)return false
  const result=await context.client.from('registry_file_cleanup').delete().in('id',data.map(row=>row.id))
  return !result.error
 }catch{return false}
}
