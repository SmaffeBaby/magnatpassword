<script setup lang="ts">
import type { ScopedCategory, ScopedCategoryFolder } from '~~/shared/utils/vault-sources'
import {categoryInFolder} from '~~/shared/utils/vault-sources'
import {svgImageUrl} from '~~/shared/utils/media'
const props=defineProps<{categories:ScopedCategory[];folders:ScopedCategoryFolder[];count:(category:ScopedCategory)=>number;canManage:(vaultId:string)=>boolean}>()
const emit=defineEmits<{open:[id:string];edit:[category:ScopedCategory];remove:[category:ScopedCategory];editFolder:[folder:ScopedCategoryFolder];removeFolder:[folder:ScopedCategoryFolder]}>()
const sections=computed(()=>[
 ...props.folders.map(folder=>({key:folder.filterId,folder,categories:props.categories.filter(category=>categoryInFolder(category,folder))})),
 {key:'__ungrouped',folder:undefined,categories:props.categories.filter(category=>!props.folders.some(folder=>categoryInFolder(category,folder)))}
])
</script>
<template>
 <div class="category-browser">
  <section v-for="section in sections" v-show="section.folder||section.categories.length" :key="section.key" class="category-folder-section">
   <header v-if="section.folder" class="category-folder-heading"><span class="category-folder-icon" :style="{color:section.folder.color}"><img v-if="section.folder.svg" :src="svgImageUrl(section.folder.svg)" alt=""/><UIcon v-else :name="section.folder.icon"/></span><div><h2>{{ section.folder.name }}</h2><p>{{ section.folder.vaultName }} · {{ section.categories.length }} категорий</p></div><div v-if="canManage(section.folder.vaultId)" class="flex gap-1"><UButton color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="Переименовать папку или изменить иконку" @click="emit('editFolder',section.folder)"/><UButton color="neutral" variant="ghost" icon="i-lucide-trash-2" aria-label="Удалить папку" @click="emit('removeFolder',section.folder)"/></div></header>
   <h2 v-else-if="folders.length" class="ungrouped-heading">Без папки</h2>
   <div class="category-grid"><article v-for="category in section.categories" :key="category.filterId" class="category-tile"><button class="category-tile-open" @click="emit('open',category.filterId)"><span class="category-icon" :style="{color:category.color,background:`${category.color}12`}"><img v-if="category.svg" :src="svgImageUrl(category.svg)" class="category-custom-icon" alt=""/><UIcon v-else :name="category.icon"/></span><span><strong>{{ category.name }}</strong><small>{{ category.vaultName }}</small><span>{{ count(category) }} записей</span></span></button><template v-if="canManage(category.vaultId)"><UButton color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="Изменить категорию" @click="emit('edit',category)"/><UButton color="neutral" variant="ghost" icon="i-lucide-trash-2" aria-label="Удалить категорию" @click="emit('remove',category)"/></template></article></div><p v-if="section.folder&&!section.categories.length" class="folder-empty">Категории своего хранилища добавляются в настройках категории, а из других хранилищ — в настройках папки.</p>
  </section>
  <p v-if="!categories.length&&!folders.length" class="subscription-empty">Категорий пока нет. Создайте категорию или папку для группировки.</p>
 </div>
</template>
