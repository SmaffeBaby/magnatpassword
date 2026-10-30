import { useQuery } from '@tanstack/vue-query'
import type { ProjectTimeline } from '~~/shared/utils/project-timeline'
export function useProjectTimeline(projectId:MaybeRefOrGetter<string|undefined>,enabled:MaybeRefOrGetter<boolean>=true){
 const auth=useAuthStore()
 return useQuery({queryKey:computed(()=>['account',auth.user?.id,'project-progress',toValue(projectId)]),queryFn:({signal})=>sharedRequest<ProjectTimeline>(`/api/projects/${toValue(projectId)}/progress`,{signal}),enabled:computed(()=>!!auth.user?.id&&!!toValue(projectId)&&toValue(enabled)),retry:false,refetchInterval:30000})
}
