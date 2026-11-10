export default defineNitroPlugin(nitro=>{
 nitro.hooks.hook('beforeResponse',event=>{
  const header=getResponseHeader(event,'content-security-policy')
  if(typeof header!=='string'||!header.includes('connect-src'))return
  const url=getRequestURL(event),socketOrigin=`${url.protocol==='https:'?'wss:':'ws:'}//${url.host}`
  setResponseHeader(event,'content-security-policy',header.replace(/connect-src([^;]*)/,(_,sources)=>`connect-src${sources} ${socketOrigin}`))
 })
})
