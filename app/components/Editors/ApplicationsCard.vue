<script setup lang="ts">
import EditorCard from './EditorCard.vue'
import { documentEditors } from '~~/shared/utils/project-documents'
defineProps<{ hero?: boolean }>()
const open = ref(false), route = useRoute()
watch(() => route.path, () => { open.value = false })
</script>
<template>
  <UPopover v-model:open="open" :content="{side:'bottom',align:'center',sideOffset:14,collisionPadding:16}" :ui="{content:'z-[80] rounded-2xl p-5 bg-white shadow-xl'}">
    <button type="button" class="password-glass" :class="{'password-launch-card':hero}" aria-label="Открыть приложения" :aria-expanded="open"><UIcon name="i-lucide-layout-grid" class="size-11 shrink-0"/><span>Приложения</span></button>
    <template #content><section class="office-applications" aria-label="Редакторы приложений"><h2>Приложения</h2><div><EditorCard v-for="editor in documentEditors" :key="editor.key" :editor="editor.key" @click="open=false"/></div></section></template>
  </UPopover>
</template>
<style scoped>.office-applications{width:min(560px,calc(100vw - 72px))}.office-applications h2{font-size:18px;font-weight:600;color:#334155;margin-bottom:16px}.office-applications>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.office-applications :deep(a){display:flex;align-items:center;gap:12px;min-width:0;padding:16px;border:1px solid #e2e8f0;border-radius:14px;font-size:16px;color:#475569}.office-applications :deep(img){width:40px;height:40px;flex-shrink:0}@media(max-width:420px){.office-applications>div{grid-template-columns:1fr}}</style>
