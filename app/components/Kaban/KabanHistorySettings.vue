<script setup lang="ts">
interface Settings {revision:number;count:number|null;unit:'days'|'months'|'years';eventCount:number;throughId:string|null}
const props=defineProps<{boards:{id:string;label:string}[]}>(),emit=defineEmits<{changed:[]}>()
const toast=useToast(),open=ref(false),selected=ref(''),settings=ref<Settings|null>(null),loading=ref(false),busy=ref(false),error=ref('')
const enabled=ref(false),count=ref(30),unit=ref<Settings['unit']>('days')
const confirm=ref<{boardId:string;label:string;revision:number;throughId:string;eventCount:number}|null>(null)
const units=[{label:'дней',value:'days'},{label:'месяцев',value:'months'},{label:'лет',value:'years'}]
let generation=0,request=0
const message=(failure:any)=>failure?.data?.message||failure?.message||'Не удалось изменить настройки истории.'
async function load(preserveDraft=false){
 if(!open.value||!selected.value)return
 const ticket=++request,boardId=selected.value;loading.value=true;error.value='';settings.value=null
 try{const result=await sharedRequest<Settings>(`/api/kaban/boards/${boardId}/history-settings`);if(ticket!==request||boardId!==selected.value)return;settings.value=result;if(!preserveDraft){enabled.value=result.count!==null;count.value=result.count??30;unit.value=result.unit}}
 catch(failure){if(ticket===request)error.value=message(failure)}finally{if(ticket===request)loading.value=false}
}
watch(open,value=>{if(value){const id=props.boards.some(board=>board.id===selected.value)?selected.value:props.boards[0]?.id||'';if(selected.value!==id)selected.value=id;else void load()}else{request++;settings.value=null;confirm.value=null;loading.value=false;error.value=''}})
watch(selected,()=>{void load()})
watch(()=>props.boards.map(board=>board.id).join(','),()=>{if(!props.boards.some(board=>board.id===selected.value)){confirm.value=null;selected.value=props.boards[0]?.id||'';if(!selected.value)open.value=false}})
async function save(){
 if(!settings.value||busy.value||loading.value)return
 if(enabled.value&&(!Number.isInteger(count.value)||count.value<1||count.value>1000)){error.value='Укажите целое число от 1 до 1000.';return}
 const attempt=generation,boardId=selected.value;busy.value=true;error.value=''
 try{const result=await sharedRequest<Settings>(`/api/kaban/boards/${boardId}/history-settings`,{method:'PUT',body:{revision:settings.value.revision,count:enabled.value?count.value:null,unit:unit.value}});if(attempt!==generation)return;settings.value=result;toast.add({title:'Настройки хранения истории сохранены',color:'success'})}
 catch(failure){if(attempt===generation)error.value=message(failure)}finally{if(attempt===generation)busy.value=false}
}
async function prepareClear(){
 if(busy.value||loading.value)return
 await load(true)
 if(settings.value?.throughId)confirm.value={boardId:selected.value,label:props.boards.find(board=>board.id===selected.value)?.label||'Хранилище',revision:settings.value.revision,throughId:settings.value.throughId,eventCount:settings.value.eventCount}
}
async function clear(){
 if(!confirm.value||busy.value)return
 const snapshot={...confirm.value},attempt=generation;busy.value=true;error.value=''
 try{const result=await sharedRequest<{removed:number}>(`/api/kaban/boards/${snapshot.boardId}/history`,{method:'DELETE',body:{revision:snapshot.revision,throughId:snapshot.throughId}});if(attempt!==generation)return;confirm.value=null;emit('changed');await load(true);toast.add({title:`Удалено записей истории: ${result.removed}`,color:'success'})}
 catch(failure){if(attempt===generation)error.value=message(failure)}finally{if(attempt===generation)busy.value=false}
}
onBeforeUnmount(()=>{generation++;request++})
</script>
<template>
 <UButton v-if="boards.length" label="Настройки истории" icon="i-lucide-settings-2" color="neutral" variant="outline" @click="open=true"/>
 <UModal v-model:open="open" title="Настройки истории" description="Срок хранения и очистка истории изменений Кабана." :dismissible="!busy" :ui="{content:'sm:max-w-xl',header:'pe-14'}">
  <template #body><div class="kaban-history-settings">
   <UFormField label="Хранилище"><USelect v-model="selected" :items="boards.map(board=>({label:board.label,value:board.id}))" :disabled="busy||boards.length===1" class="w-full"/></UFormField>
   <p v-if="loading" class="kaban-help" role="status">Загружаем настройки…</p>
   <template v-else-if="settings">
    <section><h3>Автоматическая очистка</h3><UCheckbox v-model="enabled" label="Удалять старые записи автоматически" :disabled="busy"/><div v-if="enabled" class="kaban-retention-period"><UFormField label="Хранить историю за последние"><UInput v-model.number="count" type="number" :min="1" :max="1000" :step="1" :disabled="busy" class="w-full"/></UFormField><UFormField label="Единица времени"><USelect v-model="unit" :items="units" :disabled="busy" class="w-full"/></UFormField></div>
    <p class="kaban-help">{{enabled?'После сохранения записи старше указанного срока будут безвозвратно удаляться при ближайшей фоновой очистке. Месяцы и годы считаются по календарю.':'Срок хранения не ограничен. Автоматическая очистка отключена.'}}</p><p class="kaban-help">Фоновая очистка выполняется каждый час, даже когда Кабан закрыт. Время рассчитывается по Москве.</p></section>
    <section><h3>Очистка вручную</h3><p class="kaban-help">Записей в истории: {{settings.eventCount}}. Очистится только история выбранного хранилища. Задачи, категории, файлы и история других хранилищ сохранятся.</p><UButton label="Очистить историю" icon="i-lucide-trash-2" color="error" variant="outline" :disabled="busy||!settings.throughId" @click="prepareClear"/></section>
   </template>
   <UAlert v-if="error" color="error" :description="error" :actions="!confirm?[{label:'Обновить настройки',onClick:()=>load()}]:undefined"/>
  </div></template>
  <template #footer><UButton label="Закрыть" color="neutral" variant="outline" :disabled="busy" @click="open=false"/><UButton label="Сохранить срок хранения" :loading="busy" :disabled="!settings||loading" @click="save"/></template>
 </UModal>
 <UModal :open="!!confirm" title="Очистить историю изменений?" :description="confirm?.label" :dismissible="!busy" @update:open="value=>{if(!value)confirm=null}"><template #body><p>Будет удалено записей: {{confirm?.eventCount}}. Восстановить их после очистки нельзя. Новые события, появившиеся после открытия подтверждения, останутся в истории.</p><UAlert v-if="error" color="error" :description="error" class="mt-4"/></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="busy" @click="confirm=null"/><UButton label="Очистить историю" icon="i-lucide-trash-2" color="error" :loading="busy" @click="clear"/></template></UModal>
</template>
<style scoped>
.kaban-history-settings{display:flex;flex-direction:column;gap:24px}.kaban-history-settings section{display:flex;flex-direction:column;align-items:flex-start;gap:14px;padding-top:20px;border-top:1px solid #e7edf3}.kaban-history-settings h3{font-size:14px;font-weight:650;color:#475569}.kaban-retention-period{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;width:100%}@media(max-width:480px){.kaban-retention-period{grid-template-columns:minmax(0,1fr)}}
</style>
