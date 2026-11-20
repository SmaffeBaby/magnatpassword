<script setup lang="ts">
import ProjectDocumentEditor from '../ProjectsPage/ProjectDocumentEditor.vue'
import OfficeLocationPicker from './OfficeLocationPicker.vue'

const office = useOffice(), auth = useAuthStore(), vault = useVaultStore(), tabs = useServiceTabsStore(), route = useRoute()
watch([() => auth.user?.id, () => vault.unlocked], ([id, unlocked], [previous]) => {
  if (!unlocked || id !== previous) office.clear()
})
watch([() => tabs.activeId, () => tabs.active?.editor, () => tabs.active?.path, () => vault.unlocked, () => auth.user?.id],
  ([id, origin, path, unlocked, actor], _, onCleanup) => {
    if (!actor || !unlocked || !path?.startsWith('/office/') || !origin || origin.kind === 'local') return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    void office.reopen(id, origin, controller.signal)
  }, { immediate: true })
function register(id: string, instance: unknown) {
  tabs.setCloseHandler(id, (instance as { close: () => boolean } | null)?.close)
}
const visible = computed(() => !!office.session.value && route.path.startsWith('/office/'))
</script>

<template>
  <div v-for="editor in office.sessions.value" v-show="visible && tabs.activeId === editor.key" :key="editor.key" class="office-tab-surface" :style="{ top: `${tabs.headerBottom || 88}px` }">
    <ProjectDocumentEditor
      :ref="instance => register(editor.key, instance)"
      :file="editor.file"
      :adapter="editor.adapter"
      :allow-choose-destination="editor.allowChooseDestination"
      :can-upload="editor.allowChooseDestination !== false"
      embedded
      :selected="visible && tabs.activeId === editor.key"
      @close="office.close(editor.key)"
      @cancel-close="tabs.cancelReplacement(editor.key)"
    />
  </div>
  <UModal :open="!!office.choice.value && visible" title="Куда сохранить файл?" :description="office.choice.value?.name" :ui="{overlay:'z-[120]',content:'z-[121]'}" @update:open="value=>{if(!value)office.cancelChoice()}"><template #body><OfficeLocationPicker saving @choose="office.resolveChoice"/><UButton label="Скачать на устройство" icon="i-lucide-download" color="neutral" variant="outline" class="mt-4" @click="office.resolveChoice('download')"/></template></UModal>
</template>

<style scoped>
.office-tab-surface { position:fixed; inset:88px 0 0; z-index:40; background:#f1f5f9; }
</style>
