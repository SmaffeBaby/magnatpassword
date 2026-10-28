<script setup lang="ts">
import type { ScopedCategory, ScopedCategoryFolder } from '~~/shared/utils/vault-sources'
import {categoryInFolder} from '~~/shared/utils/vault-sources'
import {svgImageUrl} from '~~/shared/utils/media'
const props=defineProps<{categories:ScopedCategory[];folders:ScopedCategoryFolder[];active:string;workspaceId:string;collapsed:string[];count:(category:ScopedCategory)=>number}>()
const emit=defineEmits<{select:[id:string];toggle:[key:string,open:boolean]}>()
const ungrouped=computed(()=>props.categories.filter(category=>!props.folders.some(folder=>categoryInFolder(category,folder))))
const members=(folder:ScopedCategoryFolder)=>props.categories.filter(category=>categoryInFolder(category,folder))
</script>
<template>
 <nav class="vault-nav category-folder-nav" aria-label="Категории">
  <button v-for="category in ungrouped" :key="category.filterId" :class="{selected:active===category.filterId}" @click="emit('select',category.filterId)"><img v-if="category.svg" :src="svgImageUrl(category.svg)" class="category-custom-icon" alt=""/><UIcon v-else :name="category.icon" :style="{color:category.color}"/><span class="nav-category-name">{{ category.name }}<small v-if="workspaceId==='all'">{{ category.vaultName }}</small></span><span class="nav-count">{{ count(category) }}</span></button>
  <details v-for="folder in folders" :key="folder.filterId" :open="!collapsed.includes(folder.filterId)" @toggle="event=>emit('toggle',folder.filterId,(event.target as HTMLDetailsElement).open)"><summary><img v-if="folder.svg" :src="svgImageUrl(folder.svg)" class="category-custom-icon" alt=""/><UIcon v-else :name="folder.icon" :style="{color:folder.color}"/><span class="nav-category-name">{{ folder.name }}<small v-if="workspaceId==='all'">{{ folder.vaultName }}</small></span><UIcon name="i-lucide-chevron-right" class="folder-chevron"/></summary><div class="category-folder-children"><button v-for="category in members(folder)" :key="category.filterId" :class="{selected:active===category.filterId}" @click="emit('select',category.filterId)"><img v-if="category.svg" :src="svgImageUrl(category.svg)" class="category-custom-icon" alt=""/><UIcon v-else :name="category.icon" :style="{color:category.color}"/><span class="nav-category-name">{{ category.name }}<small v-if="category.vaultId!==folder.vaultId">{{ category.vaultName }}</small></span><span class="nav-count">{{ count(category) }}</span></button><p v-if="!members(folder).length" class="folder-empty">Пока нет категорий</p></div></details>
 </nav>
</template>
