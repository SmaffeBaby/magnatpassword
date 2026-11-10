const requestCooldowns=new Map<string,number>()
function rateLimitFailure(seconds:number){
 const message=`Слишком много запросов. Повторите через ${seconds} сек.`
 return Object.assign(new Error(message),{statusCode:429,data:{message,data:{retryAfterSeconds:seconds}}})
}
export async function sharedRequest<T>(url: string, options: { method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal; responseType?: 'blob' } = {}): Promise<T> {
  const client = useNuxtApp().$supabase
  const auth = useAuthStore(), userId = auth.user?.id
  const scope=`${userId}:${options.method||'GET'}:${url.split('?')[0]?.split('/')[2]}`
  const remaining=(requestCooldowns.get(scope)||0)-Date.now()
  if(remaining>0)throw rateLimitFailure(Math.ceil(remaining/1000))
  requestCooldowns.delete(scope)
  const { data } = await client.auth.getSession()
  if (!data.session || !userId || auth.user?.id !== userId || data.session.user.id !== userId) throw new Error('Войдите в аккаунт')
  try {return await backendFetch<T, 'json' | 'blob'>(url, { ...options, retry: 0, body: options.body as Record<string, unknown> | undefined, headers: { Authorization: `Bearer ${data.session.access_token}` } }) as T
  }catch(error:any){
    if((error?.statusCode??error?.status)===429){
     const seconds=Math.min(Math.max(Math.ceil(Number(error.response?.headers?.get('retry-after'))||error?.data?.data?.retryAfterSeconds||60),1),300)
     if(requestCooldowns.size>1000)for(const[key,until]of requestCooldowns)if(until<=Date.now())requestCooldowns.delete(key)
     requestCooldowns.set(scope,Date.now()+seconds*1000)
     throw rateLimitFailure(seconds)
    }
    throw error
  }
}
