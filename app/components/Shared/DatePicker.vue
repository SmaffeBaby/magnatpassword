<script setup lang="ts">
import { CalendarDate, parseDate } from '@internationalized/date'
import { formatDateInput, parseDateInput } from '~/utils/date-input'
import { todayDate, validDate } from '~~/shared/utils/subscriptions'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  min?: string
  max?: string
  disabled?: boolean
  required?: boolean
  clearable?: boolean
  placeholder?: string
}>(), { clearable: true })
const model = defineModel<string>({ default: '' })
const input = ref<{ inputRef?: HTMLInputElement } | null>(null)
const text = ref(formatDateInput(model.value))
const open = ref(false), showError = ref(false), today = ref(todayDate())
const portal = shallowRef(true as true | string)
const viewDate = shallowRef<CalendarDate>()
const popup = { align: 'end', side: 'bottom', sideOffset: 8, collisionPadding: 12, 'aria-label': 'Выбор даты' } as const
const previous = { variant: 'ghost', 'aria-label': 'Предыдущий период' } as const
const next = { variant: 'ghost', 'aria-label': 'Следующий период' } as const
const value = computed(() => model.value && validDate(model.value) ? parseDate(model.value) : undefined)
const minDate = computed(() => props.min && validDate(props.min) ? props.min : '0001-01-01')
const maxDate = computed(() => props.max && validDate(props.max) ? props.max : '9999-12-31')
const minValue = computed(() => parseDate(minDate.value))
const maxValue = computed(() => parseDate(maxDate.value))
const canSelect = (date: string) => date >= minDate.value && date <= maxDate.value
const error = computed(() => {
  const date = parseDateInput(text.value)
  if (date === null) return 'Введите дату в формате ДД.ММ.ГГГГ.'
  if (!date) return props.required && text.value ? 'Укажите дату.' : ''
  if (date < minDate.value) return `Выберите дату не раньше ${formatDateInput(minDate.value)}.`
  if (date > maxDate.value) return `Выберите дату не позже ${formatDateInput(maxDate.value)}.`
  return ''
})

watch(model, date => {
  if (date !== parseDateInput(text.value)) {
    text.value = formatDateInput(date)
    showError.value = false
  }
})
watchEffect(() => input.value?.inputRef?.setCustomValidity(error.value))
watch(() => props.disabled, disabled => { if (disabled) open.value = false })

function updateText(next: unknown) {
  text.value = String(next ?? '')
  const date = parseDateInput(text.value)
  if (date !== null && (date ? canSelect(date) : props.clearable !== false)) model.value = date
}

function blur() {
  showError.value = true
  const date = parseDateInput(text.value)
  if (date !== null && !error.value) text.value = formatDateInput(date || (props.clearable === false ? model.value : ''))
}

function setOpen(next: boolean) {
  if (next && (props.disabled || input.value?.inputRef?.disabled)) return
  if (next && !open.value) {
    today.value = todayDate()
    const focus = value.value?.toString() || today.value
    viewDate.value = parseDate(focus < minDate.value ? minDate.value : focus > maxDate.value ? maxDate.value : focus)
    portal.value = document.fullscreenElement ? ':fullscreen' : true
  }
  open.value = next
}

function choose(date: string) {
  if (date && !canSelect(date)) return
  text.value = formatDateInput(date)
  model.value = date
  showError.value = false
  setOpen(false)
}
</script>

<template>
  <UInput
    ref="input"
    v-bind="$attrs"
    :model-value="text"
    :placeholder="placeholder ?? 'ДД.ММ.ГГГГ'"
    :disabled="disabled"
    :required="required"
    :aria-invalid="showError && error ? true : undefined"
    :title="showError && error ? error : undefined"
    inputmode="numeric"
    maxlength="10"
    :ui="{ trailing: 'pointer-events-auto pe-1' }"
    @update:model-value="updateText"
    @blur="blur"
    @invalid="showError = true"
    @keydown.alt.down.prevent="setOpen(true)"
  >
    <template #trailing>
      <UPopover
        :open="open"
        :portal="portal"
        :content="popup"
        :ui="{ content: 'magnat-calendar-popover z-[1100] overflow-y-auto rounded-2xl p-3 shadow-xl' }"
        @update:open="setOpen"
      >
        <UButton type="button" icon="i-lucide-calendar-days" size="xs" color="neutral" variant="ghost" aria-label="Открыть календарь" :disabled="disabled" />
        <template #content>
          <UCalendar
            v-model:placeholder="viewDate"
            :model-value="value"
            locale="ru-RU"
            calendar-label="Календарь"
            :week-starts-on="1"
            weekday-format="short"
            :year-controls="false"
            :view-control="{ trailingIcon: 'i-lucide-chevron-down', class: 'font-semibold' }"
            :prev-month="previous"
            :next-month="next"
            :min-value="minValue"
            :max-value="maxValue"
            :ui="{ body: 'pt-2', headCell: 'pb-1 font-medium capitalize text-muted', cellTrigger: 'rounded-lg data-disabled:opacity-45 data-today:ring-1 data-today:ring-inset data-today:ring-default' }"
            prevent-deselect
            initial-focus
            @update:model-value="date => { if (date) choose(date.toString()) }"
          />
          <div class="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-default pt-2">
            <UButton v-if="clearable !== false && !required" type="button" label="Очистить" color="neutral" variant="ghost" size="sm" :disabled="!text" @click="choose('')" />
            <UButton type="button" label="Сегодня" icon="i-lucide-calendar-check" variant="soft" size="sm" class="ms-auto" :disabled="!canSelect(today)" @click="choose(today)" />
          </div>
        </template>
      </UPopover>
    </template>
  </UInput>
</template>

<style scoped>
:global(.magnat-calendar-popover){width:min(20rem,calc(100vw - 24px));max-height:var(--reka-popper-available-height,calc(100dvh - 24px))}
</style>
