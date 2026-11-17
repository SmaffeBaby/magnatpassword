<script setup lang="ts">
import { documentEditors, type DocumentEditorKey } from '~~/shared/utils/project-documents'
const props = defineProps<{ editor: DocumentEditorKey; hero?: boolean }>()
const label = computed(() => documentEditors.find(e=>e.key===props.editor)!.label)
</script>
<template><NuxtLink :to="`/office/${editor}`" class="password-glass" :class="{'password-launch-card':hero}" :aria-label="`Открыть ${label}`"><img :src="`/editor-icons/${editor}.ico`" alt="" width="44" height="44"/><span>{{label}}</span></NuxtLink></template>
