<script setup lang="ts">
import ProjectDocumentEditor from '../ProjectsPage/ProjectDocumentEditor.vue'
import OfficeLocationPicker from './OfficeLocationPicker.vue'
const office = useOffice(), auth = useAuthStore(), vault = useVaultStore()
watch([() => auth.user?.id, () => vault.unlocked], () => office.close())
</script>
<template>
  <ProjectDocumentEditor v-if="office.session.value" :key="office.session.value.key" :file="office.session.value.file" :adapter="office.session.value.adapter" :can-upload="true" @close="office.close"/>
  <UModal :open="!!office.choice.value" title="Куда сохранить файл?" :description="office.choice.value?.name" :ui="{overlay:'z-[120]',content:'z-[121]'}" @update:open="value=>{if(!value)office.cancelChoice()}"><template #body><OfficeLocationPicker saving @choose="office.resolveChoice"/><UButton label="Скачать на устройство" icon="i-lucide-download" color="neutral" variant="outline" class="mt-4" @click="office.resolveChoice('download')"/></template></UModal>
</template>
