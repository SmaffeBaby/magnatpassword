import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import * as XLSX from 'xlsx'
const run=promisify(execFile)
let rendering=false
export async function spaceThumbnail(bytes:Buffer,name:string){
 const ext=name.split('.').pop()?.toLowerCase()||''
 if(['xlsx','xls','csv','ods'].includes(ext)){const workbook=XLSX.read(bytes,{type:'buffer',sheetRows:10,bookVBA:false,cellFormula:false});const sheet=workbook.Sheets[workbook.SheetNames[0]!]!;return {kind:'cells',rows:Array.from({length:5},(_,r)=>Array.from({length:2},(_,c)=>String(sheet?.[XLSX.utils.encode_cell({r,c})]?.w??sheet?.[XLSX.utils.encode_cell({r,c})]?.v??'').slice(0,200)))}}
 if(!['pdf','docx','doc','odt','pptx','ppt','odp'].includes(ext))return {kind:'unavailable'}
 if(rendering)throw createError({statusCode:503,message:'Миниатюра готовится, повторите позже'})
 rendering=true;const dir=await mkdtemp(join(tmpdir(),'space-thumb-'))
 try{const source=join(dir,`source.${ext}`);await writeFile(source,bytes)
 if(ext!=='pdf')await run('libreoffice',['--headless',`-env:UserInstallation=file://${dir}/profile`,'--convert-to','pdf','--outdir',dir,source],{timeout:40000,maxBuffer:1024*1024,env:{...process.env,SAL_USE_VCLPLUGIN:'svp'}})
 await run('pdftoppm',['-f','1','-singlefile','-scale-to','650','-png',join(dir,ext==='pdf'?'source.pdf':'source.pdf'),join(dir,'preview')],{timeout:15000,maxBuffer:1024*1024})
 return {kind:'image',src:`data:image/png;base64,${(await readFile(join(dir,'preview.png'))).toString('base64')}`}
 }finally{rendering=false;await rm(dir,{recursive:true,force:true})}
}
