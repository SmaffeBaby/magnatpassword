<script setup lang="ts">
import type { KabanCategory } from '~~/shared/types/kaban'

const props = defineProps<{ categories: KabanCategory[]; count: (category: KabanCategory) => number; canCreate: boolean; canAddChild: (category: KabanCategory) => boolean }>()
defineEmits<{ select: [id: string]; create: []; createChild: [category: KabanCategory] }>()
const query = ref('')
const matches = (category: KabanCategory) => category.name.toLocaleLowerCase('ru').includes(query.value.trim().toLocaleLowerCase('ru'))
const allChildren = (id: string) => props.categories.filter(category => category.parentId === id)
const roots = computed(() => props.categories.filter(category => !category.parentId && (matches(category) || allChildren(category.id).some(matches))))
const children = (category: KabanCategory) => allChildren(category.id).filter(child => matches(category) || matches(child))
</script>

<template>
  <div class="kaban-categories-page">
    <div class="kaban-category-toolbar">
      <UInput v-model="query" icon="i-lucide-search" placeholder="Найти категорию или подкатегорию…" aria-label="Поиск категорий и подкатегорий" class="kaban-category-search" />
      <UButton v-if="canCreate" label="Новая категория" icon="i-lucide-plus" @click="$emit('create')" />
    </div>
    <div class="kaban-category-browser">
    <section v-for="category in roots" :key="category.id" class="kaban-category-group">
      <button type="button" class="kaban-category-link" @click="$emit('select', category.id)">
        <span class="kaban-stage-dot" :style="{ background: category.color }" />
        <strong>{{ category.name }}</strong><span class="kaban-category-count">{{ count(category) }}</span><UIcon name="i-lucide-arrow-up-right" />
      </button>
      <div v-if="children(category).length" class="kaban-category-children">
        <button v-for="child in children(category)" :key="child.id" type="button" class="kaban-category-link" @click="$emit('select', child.id)">
          <span class="kaban-stage-dot" :style="{ background: child.color }" />
          <span>{{ child.name }}</span><span class="kaban-category-count">{{ count(child) }}</span><UIcon name="i-lucide-chevron-right" />
        </button>
      </div>
      <div v-if="canAddChild(category)" class="kaban-category-add"><UButton label="Добавить подкатегорию" icon="i-lucide-folder-plus" color="neutral" variant="ghost" :aria-label="`Добавить подкатегорию: ${category.name}`" @click="$emit('createChild',category)" /></div>
    </section>
    <p v-if="!categories.length" class="kaban-help">Нет открытых категорий.</p>
    <p v-else-if="!roots.length" class="kaban-help">Категории и подкатегории не найдены.</p>
    </div>
  </div>
</template>

<style scoped>
.kaban-category-toolbar{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:24px}
.kaban-category-search{width:min(100%,480px)}
.kaban-category-add{border-top:1px solid #eef2f7;padding:8px 12px}
.kaban-category-browser{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px;align-items:start}
.kaban-category-group{border:1px solid #e2e8f0;border-radius:16px;background:white;overflow:hidden}
.kaban-category-link{display:flex;align-items:center;gap:12px;width:100%;padding:20px;text-align:left;font-size:13px;color:#475569;overflow-wrap:anywhere}
.kaban-category-link:hover{background:#f8fafc;color:var(--ui-primary)}
.kaban-category-link:focus-visible{outline-offset:-4px}
.kaban-category-link>strong,.kaban-category-link>span:nth-child(2){flex:1;min-width:0}
.kaban-category-count{font-size:11px;color:#94a3b8;flex-shrink:0}
.kaban-category-children{border-top:1px solid #eef2f7;padding:4px 0 4px 16px}
.kaban-category-children .kaban-category-link{padding-block:14px}
</style>
