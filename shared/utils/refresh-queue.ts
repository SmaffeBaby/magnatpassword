type Clock={now:()=>number;set:(callback:()=>void,delay:number)=>unknown;clear:(timer:unknown)=>void}
const realClock:Clock={now:Date.now,set:(fn,delay)=>setTimeout(fn,delay),clear:timer=>clearTimeout(timer as ReturnType<typeof setTimeout>)}
// One running refresh and at most one trailing refresh for any burst of events.
export class RefreshQueue {
 private pending=false;private running=false;private stopped=false;private timer:unknown;private lastStart=-Infinity
 constructor(private refresh:()=>Promise<void>,private paused:()=>boolean,private clock:Clock=realClock,private minimumInterval=1000){}
 request(){this.pending=true;this.resume()}
 resume(){
  if(!this.pending||this.running||this.stopped||this.timer!==undefined||this.paused())return
  const delay=Math.max(150,this.minimumInterval-(this.clock.now()-this.lastStart))
  this.timer=this.clock.set(()=>{this.timer=undefined;void this.flush()},delay)
 }
 private async flush(){
  if(this.stopped||this.paused())return
  this.pending=false;this.running=true;this.lastStart=this.clock.now()
  try{await this.refresh()}catch{/* The caller owns UI errors; retry on the next event/reconnect. */}
  finally{this.running=false;this.resume()}
 }
 stop(){this.stopped=true;this.pending=false;if(this.timer!==undefined)this.clock.clear(this.timer);this.timer=undefined}
}
