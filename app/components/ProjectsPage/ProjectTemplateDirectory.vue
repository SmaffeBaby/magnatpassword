<script setup lang="ts">
import DocumentTemplateLibrary from './DocumentTemplateLibrary.vue'
const route=useRoute(),stage=computed(()=>'closing'===route.query.stage?'closing':'execution')
</script>
<template><section aria-label="Общее хранилище шаблонов документов"><nav class="template-stage-tabs" aria-label="Этапы шаблонов"><NuxtLink :to="{path:'/projects',query:{tab:'document-templates',stage:'execution'}}" :aria-current="stage==='execution'?'page':undefined"><UIcon name="i-lucide-files"/>Исполнение</NuxtLink><NuxtLink :to="{path:'/projects',query:{tab:'document-templates',stage:'closing'}}" :aria-current="stage==='closing'?'page':undefined"><UIcon name="i-lucide-clipboard-check"/>Подтверждение и закрывающие акты</NuxtLink></nav><DocumentTemplateLibrary inline :stage="stage" :project-templates="{}" :current-kind="stage==='execution'?'contract':'act'" :can-apply="false" :has-document="false" :current-template="null"/></section></template>
<style scoped>
.template-stage-tabs{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0 24px}.template-stage-tabs a{display:flex;align-items:center;gap:10px;padding:15px 20px;border:1px solid #dce3ec;border-radius:14px;background:#fff;font-size:14px;font-weight:600;color:#8292a8}.template-stage-tabs a[aria-current=page]{border-color:var(--ui-primary);color:var(--ui-primary);background:#f5f4f9}.template-stage-tabs .iconify{font-size:20px}@media(max-width:600px){.template-stage-tabs a{width:100%;font-size:13px;padding:14px 16px}}
</style>
