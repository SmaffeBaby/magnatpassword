import {sanitizeSvg,svgImageUrl} from '~~/shared/utils/media'
import type {CardImage} from '~~/shared/types/vault'
import {createId} from '~/utils/browser'
export function useMediaUploads(){
 const mediaError=ref(''),mediaBusy=ref(false)
 function files(event:Event){const input=event.target as HTMLInputElement,result=Array.from(input.files??[]);input.value='';return result}
 async function readSvg(event:Event){
  mediaError.value='';const file=files(event)[0];if(!file)return
  if(file.size>65000){mediaError.value='SVG должен быть не больше 64 КБ.';return}
  const value=sanitizeSvg(await file.text())
  if(!value){mediaError.value='Выберите корректный файл SVG с векторным изображением.';return}
  return value
 }
 const readData=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file)})
 async function readImages(event:Event,remaining:number):Promise<CardImage[]>{
  mediaError.value='';const selected=files(event)
  if(selected.length>remaining){mediaError.value='К карточке можно прикрепить до 5 изображений.';return []}
  mediaBusy.value=true
  try{
   const result:CardImage[]=[]
   for(const file of selected){
    if(!['image/jpeg','image/png'].includes(file.type)||file.size>10*1024*1024)throw Error('Выберите JPEG или PNG размером до 10 МБ.')
    const image=new Image();image.src=await readData(file);await image.decode()
    let scale=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight)),data=''
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d')!
    for(let attempt=0;attempt<8;attempt++){
     canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height)
     data=canvas.toDataURL(file.type,.82);if(data.length<350000)break;scale*=.7
    }
    if(data.length>=350000)throw Error('Не удалось уменьшить изображение. Выберите другой файл.')
    result.push({id:createId(),name:file.name.slice(0,160),data})
   }
   return result
  }catch(error){mediaError.value=error instanceof Error?error.message:'Не удалось загрузить изображение';return []}
  finally{mediaBusy.value=false}
 }
 return {mediaError,mediaBusy,readSvg,readImages,svgImageUrl}
}
