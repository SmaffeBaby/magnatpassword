import {select,scaleBand,scaleLinear,axisBottom,axisLeft,max,format} from 'd3'
export function useFinanceChart(props:{monthly:{key:string;label:string;planned:number;paid:number}[];distribution:{key:string;label:string;value:number}[];currency:string}) {
 const canvas=ref<SVGSVGElement|null>(null),groupCanvas=ref<SVGSVGElement|null>(null),host=ref<HTMLElement|null>(null)
 let observer:ResizeObserver|undefined
 function render(){
  if(!canvas.value||!groupCanvas.value||!host.value)return
  const width=Math.max(320,canvas.value.clientWidth),height=290,left=65,right=18,bottom=55,top=18
  const svg=select(canvas.value).attr('viewBox',`0 0 ${width} ${height}`);svg.selectAll('*').remove()
  const x=scaleBand<string>().domain(props.monthly.map(item=>item.key)).range([left,width-right]).padding(.25)
  const y=scaleLinear().domain([0,max(props.monthly,item=>Math.max(item.paid,item.planned))||1]).nice().range([height-bottom,top])
  const labels=new Map(props.monthly.map(item=>[item.key,item.label]))
  const ticks=Math.ceil(props.monthly.length/Math.max(1,Math.floor(width/65)))
  svg.append('g').attr('transform',`translate(0,${height-bottom})`).call(axisBottom(x).tickValues(props.monthly.filter((_,i)=>i%ticks===0).map(item=>item.key)).tickFormat(key=>labels.get(key)||key)).selectAll('text').attr('transform','rotate(-25)').style('text-anchor','end')
  svg.append('g').attr('transform',`translate(${left},0)`).call(axisLeft(y).ticks(5).tickFormat(value=>format('~s')(Number(value))))
  const bars=svg.append('g').selectAll('g').data(props.monthly).join('g')
  for(const [kind,color,offset] of [['planned','#94a3b8',0],['paid','#10b981',.5]] as const){bars.append('rect').attr('x',item=>x(item.key)!+x.bandwidth()*offset).attr('y',item=>y(item[kind])).attr('width',x.bandwidth()/2).attr('height',item=>height-bottom-y(item[kind])).attr('rx',3).attr('fill',color).append('title').text(item=>`${item.label}: ${kind==='paid'?'Отмечено оплат':'План'} ${item[kind]} ${props.currency}`)}
  const groupWidth=Math.max(320,groupCanvas.value.clientWidth),groupHeight=Math.max(110,props.distribution.length*44+25),groups=select(groupCanvas.value).attr('viewBox',`0 0 ${groupWidth} ${groupHeight}`);groups.selectAll('*').remove()
  const scale=scaleLinear().domain([0,max(props.distribution,item=>item.value)||1]).range([0,groupWidth-30])
  props.distribution.forEach((item,i)=>{const g=groups.append('g').attr('transform',`translate(12,${i*44+16})`);g.append('text').text(item.label.length>40?item.label.slice(0,40)+'…':item.label).attr('fill','#475569').attr('font-size',11);g.append('rect').attr('y',9).attr('width',groupWidth-30).attr('height',8).attr('rx',4).attr('fill','#f1f5f9');g.append('rect').attr('y',9).attr('width',scale(item.value)).attr('height',8).attr('rx',4).attr('fill','#818cf8').append('title').text(`${item.label}: ${item.value} ${props.currency}`)})
 }
 watch(()=>[props.monthly,props.distribution,props.currency],()=>nextTick(render),{deep:true})
 onMounted(()=>{observer=new ResizeObserver(render);if(host.value)observer.observe(host.value);render()})
 onBeforeUnmount(()=>observer?.disconnect())
 return {canvas,groupCanvas,host}
}
