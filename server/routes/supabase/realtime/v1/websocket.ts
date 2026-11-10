// Same-origin relay to the existing gateway; gateway JWT checks and RLS remain in force.
const connections=new WeakMap<object,{socket:WebSocket;queue:string[]}>()
export default defineWebSocketHandler({
 upgrade(request){
  const origin=request.headers.get('origin'),url=new URL(request.url)
  if(origin&&![`http://${url.host}`,`https://${url.host}`,'tauri://localhost','http://tauri.localhost','https://tauri.localhost'].includes(origin))return new Response('Forbidden',{status:403})
 },
 open(peer){
  const incoming=new URL(peer.request.url),target=new URL('/realtime/v1/websocket',useRuntimeConfig().supabaseUrl)
  target.protocol=target.protocol==='https:'?'wss:':'ws:';target.search=incoming.search
  const socket=new WebSocket(target),connection={socket,queue:[] as string[]}
  connections.set(peer,connection)
  socket.addEventListener('open',()=>{for(const text of connection.queue)socket.send(text);connection.queue=[]})
  socket.addEventListener('message',message=>{if(typeof message.data==='string')peer.send(message.data)})
  socket.addEventListener('close',()=>{peer.close(1012,'Realtime disconnected');connections.delete(peer)})
  socket.addEventListener('error',()=>{peer.close(1011,'Realtime unavailable');connections.delete(peer)})
 },
 message(peer,message){
  const connection=connections.get(peer);if(!connection)return
  const text=message.text()
  if(text.length>65536||connection.queue.length>=50){peer.close(1009,'Message too large');return}
  if(connection.socket.readyState===WebSocket.OPEN)connection.socket.send(text)
  else if(connection.socket.readyState===WebSocket.CONNECTING)connection.queue.push(text)
 },
 close(peer){connections.get(peer)?.socket.close();connections.delete(peer)},
 error(peer){connections.get(peer)?.socket.close();connections.delete(peer)}
})
