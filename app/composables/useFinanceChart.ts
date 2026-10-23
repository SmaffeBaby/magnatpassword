import { select, scaleBand, scaleLinear, axisBottom, axisLeft, max, format } from 'd3'
import type { FinanceMonth, FinanceSegment } from '~~/shared/types/finances'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'

export function useFinanceChart(props: { monthly: FinanceMonth[]; distribution: {key:string;label:string;value:number}[]; currency:string }, open: (entry: ScopedCredential) => void) {
 const canvas=useTemplateRef<SVGSVGElement>('finance-chart-canvas'),groupCanvas=useTemplateRef<SVGSVGElement>('finance-chart-groups'),host=useTemplateRef<HTMLElement>('finance-chart-host')
 let observer:ResizeObserver|undefined
 const serviceColor=(key:string)=>{
  let hash=0
  for(const character of key)hash=(Math.imul(hash,31)+character.charCodeAt(0))>>>0
  return `hsl(${hash%360} 62% 45%)`
 }
 const services=computed(()=>{
  const items=new Map<string,FinanceSegment>()
  for(const month of props.monthly)for(const segment of [...month.plannedSegments,...month.paidSegments])if(!items.has(segment.key))items.set(segment.key,segment)
  return [...items.values()]
 })
 const money=(value:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value)+' '+props.currency
 const share=(amount:number,total:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(total?amount/total*100:0)+'%'
 function render(){
  if(!canvas.value||!groupCanvas.value||!host.value)return
  const width=Math.max(320,canvas.value.clientWidth),height=310,left=65,right=18,bottom=65,top=18
  const svg=select(canvas.value).attr('viewBox',`0 0 ${width} ${height}`);svg.selectAll('*').remove()
  const x=scaleBand<string>().domain(props.monthly.map(item=>item.key)).range([left,width-right]).padding(.25)
  const y=scaleLinear().domain([0,max(props.monthly,item=>Math.max(item.paid,item.planned))||1]).nice().range([height-bottom,top])
  const labels=new Map(props.monthly.map(item=>[item.key,item.label]))
  const ticks=Math.ceil(props.monthly.length/Math.max(1,Math.floor(width/65)))
  svg.append('g').attr('transform',`translate(0,${height-bottom})`).call(axisBottom(x).tickValues(props.monthly.filter((_,i)=>i%ticks===0).map(item=>item.key)).tickFormat(key=>labels.get(key)||key)).selectAll('text').attr('transform','rotate(-25)').style('text-anchor','end')
  svg.append('g').attr('transform',`translate(${left},0)`).call(axisLeft(y).ticks(5).tickFormat(value=>format('~s')(Number(value))))
  const bars=svg.append('g')
  for(const month of props.monthly)for(const kind of ['planned','paid'] as const){
   let cents=0
   const segments=kind==='planned'?month.plannedSegments:month.paidSegments
   const barWidth=x.bandwidth()*.44,offset=kind==='planned'?0:x.bandwidth()*.56
   for(const segment of segments){
    const lower=cents/100;cents+=Math.round(segment.amount*100)
    if(segment.amount<=0)continue
    const label=`${month.label} · ${kind==='planned'?'План':'Оплачено'} · ${segment.label}: ${money(segment.amount)} · ${share(segment.amount,month[kind])} от ${money(month[kind])}`
    const rect=bars.append('rect').attr('x',x(month.key)!+offset).attr('y',y(cents/100)).attr('width',barWidth).attr('height',Math.max(0,y(lower)-y(cents/100))).attr('fill',serviceColor(segment.key)).attr('fill-opacity',kind==='planned'?.65:1).attr('stroke','white').attr('stroke-width',.6).attr('aria-label',label)
    rect.append('title').text(label)
    if(segment.entry){
     rect.attr('role','button').attr('tabindex',0).attr('class','finance-chart-segment').on('click',()=>open(segment.entry!)).on('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open(segment.entry!)}})
    }
   }
  }
  const groupWidth=Math.max(320,groupCanvas.value.clientWidth),groupHeight=Math.max(110,props.distribution.length*44+25),groups=select(groupCanvas.value).attr('viewBox',`0 0 ${groupWidth} ${groupHeight}`);groups.selectAll('*').remove()
  const scale=scaleLinear().domain([0,max(props.distribution,item=>item.value)||1]).range([0,groupWidth-30])
  props.distribution.forEach((item,i)=>{const g=groups.append('g').attr('transform',`translate(12,${i*44+16})`);g.append('text').text(item.label.length>40?item.label.slice(0,40)+'…':item.label).attr('fill','#475569').attr('font-size',11);g.append('rect').attr('y',9).attr('width',groupWidth-30).attr('height',8).attr('rx',4).attr('fill','#f1f5f9');g.append('rect').attr('y',9).attr('width',scale(item.value)).attr('height',8).attr('rx',4).attr('fill','#818cf8').append('title').text(`${item.label}: ${money(item.value)}`)})
 }
 watch(()=>[props.monthly,props.distribution,props.currency],()=>nextTick(render),{deep:true})
 onMounted(()=>{observer=new ResizeObserver(render);if(host.value)observer.observe(host.value);render()})
 onBeforeUnmount(()=>observer?.disconnect())
 return {services,serviceColor,money,share}
}
