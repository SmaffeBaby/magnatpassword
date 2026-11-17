import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { DirectoryCompany } from '~~/shared/types/project-companies'
export function useProjectCompanies(projectId?: MaybeRefOrGetter<string>) {
  const auth=useAuthStore(),client=useQueryClient()
  const queryKey=computed(()=>['account',auth.user?.id,'project-companies',projectId?toValue(projectId):'directory'])
  const query=useQuery({queryKey,queryFn:({signal})=>sharedRequest<DirectoryCompany[]>(`/api/projects/companies${projectId?'?projectId='+encodeURIComponent(toValue(projectId)):''}`,{signal}),retry:false,refetchInterval:30000})
  async function refresh(){ await Promise.all([client.invalidateQueries({queryKey:['account',auth.user?.id,'project-companies']}),client.invalidateQueries({queryKey:['account',auth.user?.id,'project-estimate']})]) }
  return {query,refresh}
}
