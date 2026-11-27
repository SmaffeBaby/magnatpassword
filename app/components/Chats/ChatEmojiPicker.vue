<script setup lang="ts">
const props = defineProps<{ accountId?: string; disabled?: boolean }>()
const emit = defineEmits<{ select: [emoji: string] }>()
const categories = [
  { id: -1, label: 'Недавние', icon: 'i-lucide-clock' },
  { id: 0, label: 'Смайлы и эмоции', icon: 'i-lucide-smile' },
  { id: 1, label: 'Люди и жесты', icon: 'i-lucide-hand' },
  { id: 3, label: 'Животные и природа', icon: 'i-lucide-leaf' },
  { id: 4, label: 'Еда и напитки', icon: 'i-lucide-apple' },
  { id: 5, label: 'Путешествия и места', icon: 'i-lucide-plane' },
  { id: 6, label: 'Спорт и занятия', icon: 'i-lucide-trophy' },
  { id: 7, label: 'Предметы', icon: 'i-lucide-lightbulb' },
  { id: 8, label: 'Символы', icon: 'i-lucide-heart' },
  { id: 9, label: 'Флаги', icon: 'i-lucide-flag' }
]
const limit = 32
const open = ref(false), portal = ref<true | string>(true)
const search = ref(''), category = ref(0), recent = ref<string[]>([])
const grid = useTemplateRef<HTMLElement>('emoji-grid')
type Emoji = { unicode: string; label: string; group: number; searchable: string }
const catalog = shallowRef<Emoji[]>([])
const loading = ref(false), failed = ref(false)
const storageKey = computed(() => `magnat:chat-emoji:${props.accountId ?? 'local'}`)
const normalize = (value: string) => value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\uFE0F/g, '')
const terms = computed(() => normalize(search.value).trim().split(/\s+/).filter(Boolean))
const byEmoji = computed(() => new Map(catalog.value.map(emoji => [emoji.unicode, emoji])))
const visible = computed(() => {
  if (terms.value.length) return catalog.value.filter(emoji => terms.value.every(term => emoji.searchable.includes(term)))
  if (category.value === -1) return recent.value.flatMap(value => byEmoji.value.get(value) ?? [])
  return catalog.value.filter(emoji => emoji.group === category.value)
})
const heading = computed(() => terms.value.length ? 'Результаты поиска' : categories.find(item => item.id === category.value)?.label)
let returnFocusToComposer = false
const popover = {
  side: 'top',
  align: 'end',
  'aria-label': 'Выбор эмодзи',
  onCloseAutoFocus: (event: Event) => { if (returnFocusToComposer) event.preventDefault() }
} as const

async function loadCatalog() {
  if (catalog.value.length || loading.value) return
  loading.value = true
  failed.value = false
  try {
    const [{ default: russian }, { default: english }] = await Promise.all([
      import('emojibase-data/ru/compact.json'),
      import('emojibase-data/en/compact.json')
    ])
    const labels = new Map(english.map(item => [item.hexcode, [item.label, ...item.tags ?? []]]))
    catalog.value = russian.flatMap(item => typeof item.group === 'number' && item.group !== 2 ? [{
      unicode: item.unicode,
      label: item.label,
      group: item.group,
      searchable: normalize([item.unicode, item.label, ...item.tags ?? [], ...labels.get(item.hexcode) ?? []].join(' '))
    }] : [])
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

function readRecent() {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey.value) ?? '[]')
    if (Array.isArray(stored)) recent.value = stored.filter((item): item is string => typeof item === 'string').slice(0, limit)
  } catch {
    // The picker remains usable when local storage is unavailable.
  }
}

function setOpen(value: boolean) {
  open.value = value
  if (!value) return
  returnFocusToComposer = false
  portal.value = document.fullscreenElement ? ':fullscreen' : true
  search.value = ''
  readRecent()
  category.value = recent.value.length ? -1 : 0
  void loadCatalog()
}

function select(emoji: string) {
  if (props.disabled) return
  recent.value = [emoji, ...recent.value.filter(item => item !== emoji)].slice(0, limit)
  try { localStorage.setItem(storageKey.value, JSON.stringify(recent.value)) } catch {}
  returnFocusToComposer = true
  open.value = false
  emit('select', emoji)
}

watch([category, search], () => { if (grid.value) grid.value.scrollTop = 0 })
watch(() => props.accountId, () => { recent.value = []; open.value = false })
watch(() => props.disabled, disabled => { if (disabled) open.value = false })
</script>

<template>
  <UPopover :open="open" :portal="portal" :content="popover" @update:open="setOpen">
    <UButton type="button" class="size-10 justify-center rounded-full p-0" color="neutral" variant="ghost" icon="i-lucide-smile-plus" aria-label="Добавить эмодзи" :disabled="disabled"/>
    <template #content>
      <div class="w-80 max-w-[calc(100vw-1rem)] space-y-2 p-3">
        <UInput v-model="search" class="w-full" icon="i-lucide-search" placeholder="Поиск эмодзи" aria-label="Поиск эмодзи" :maxlength="80" @keydown.enter.prevent.stop/>
        <div class="flex flex-wrap gap-0.5 border-b border-default pb-2" role="group" aria-label="Категории эмодзи">
          <UButton v-for="item in categories" :key="item.id" type="button" size="xs" color="neutral" :variant="!terms.length && category === item.id ? 'soft' : 'ghost'" :icon="item.icon" :aria-pressed="!terms.length && category === item.id" :aria-label="item.label" :title="item.label" @click="category = item.id; search = ''"/>
        </div>
        <h3 class="text-xs font-medium text-muted">{{ heading }}</h3>
        <div ref="emoji-grid" class="max-h-[min(14rem,40dvh)] overflow-auto overscroll-contain">
          <p v-if="loading" class="py-2 text-sm text-muted" role="status">Загружаем эмодзи…</p>
          <div v-else-if="failed" class="space-y-2 py-2">
            <p class="text-sm text-error">Не удалось загрузить эмодзи.</p>
            <UButton type="button" color="neutral" variant="outline" size="xs" label="Повторить" @click="loadCatalog"/>
          </div>
          <p v-else-if="!visible.length" class="py-2 text-sm text-muted" role="status">{{ terms.length ? 'Эмодзи не найдены.' : 'Здесь появятся выбранные эмодзи.' }}</p>
          <div v-else class="grid grid-cols-8 gap-0.5">
            <button v-for="emoji in visible" :key="emoji.unicode" type="button" class="flex aspect-square items-center justify-center rounded-md text-xl hover:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary" :aria-label="emoji.label" :title="emoji.label" @click="select(emoji.unicode)">{{ emoji.unicode }}</button>
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>
