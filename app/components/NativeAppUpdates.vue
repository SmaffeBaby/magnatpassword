<script setup lang="ts">
const version=useAppVersionStore(),route=useRoute()
let lastOpening=0,disposed=false
async function opening(){
 if(document.visibilityState!=='visible'||Date.now()-lastOpening<5000)return
 lastOpening=Date.now()
 await version.check(route.path!=='/downloads')
 if(disposed)version.dismiss()
}
onMounted(async()=>{
 await version.initialize()
 if(!version.native||disposed)return
 void opening()
 document.addEventListener('visibilitychange',opening)
 window.addEventListener('online',opening)
})
onBeforeUnmount(()=>{disposed=true;document.removeEventListener('visibilitychange',opening);window.removeEventListener('online',opening)})
</script>
<template>
 <UModal v-model:open="version.promptOpen" :title="`Доступна новая версия приложения Magnat v${version.release?.version||''}`" description="Скачайте и установите актуальную версию для вашего устройства." :ui="{footer:'justify-end flex-wrap'}">
  <template #body><div class="space-y-4"><p class="text-sm text-slate-500">Установлена версия <strong class="text-slate-700">{{version.installed}}</strong></p><p v-if="version.release?.notes" class="whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 max-h-52 overflow-auto">{{version.release.notes}}</p></div></template>
  <template #footer><UButton label="Перейти и скачать" icon="i-lucide-download" @click="version.downloads()"/><UButton label="Позже" color="neutral" variant="outline" @click="version.dismiss()"/><UButton label="Закрыть" color="neutral" variant="ghost" @click="version.dismiss()"/></template>
 </UModal>
</template>
