// Fixed windows are bounded in memory; identities must come from validated sessions.
export class RequestBudget {
 private buckets=new Map<string,{count:number;until:number}>()
 constructor(private capacity=20000){}
 take(key:string,limit:number,windowMs:number,now=Date.now()):number {
  let bucket=this.buckets.get(key)
  if(bucket&&now>=bucket.until){this.buckets.delete(key);bucket=undefined}
  if(!bucket){
   if(this.buckets.size>=this.capacity){for(const [id,item]of this.buckets)if(now>=item.until)this.buckets.delete(id)}
   // Fail closed under a flood of new identities instead of evicting active limits.
   if(this.buckets.size>=this.capacity)return windowMs
   bucket={count:0,until:now+windowMs};this.buckets.set(key,bucket)
  }
  if(bucket.count>=limit)return Math.max(1,bucket.until-now)
  bucket.count++;return 0
 }
}
