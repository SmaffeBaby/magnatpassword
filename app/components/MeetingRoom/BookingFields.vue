<script setup lang="ts">
import UserPicker from '~/components/Shared/UserPicker.vue'
import type { MeetingRoomBooking, MeetingRoomFormSeed, MeetingRoomFormInput, MeetingRoomPerson } from '~~/shared/types/meeting-room'
import type { TeamPerson } from '~~/shared/types/team'
import { meetingRoomCloses, meetingRoomFileLimit, meetingRoomOpens, meetingRoomParticipantLimit, validMeetingRoomTime } from '~~/shared/utils/meeting-room'
import { validDate } from '~~/shared/utils/subscriptions'

const props = defineProps<{ formId: string; seed: MeetingRoomFormSeed; editing?: MeetingRoomBooking | null; busy: boolean; error?: string }>()
const emit = defineEmits<{ submit: [input: MeetingRoomFormInput, file?: File] }>()
const draft = reactive({ ...props.seed })
const participants = ref<MeetingRoomPerson[]>([...props.editing?.participants ?? []])
const participantIds = computed(() => participants.value.map(person => person.id))
const file = shallowRef<File>()
const removeAttachment = ref(false)
const validation = ref('')

function addParticipant(person: TeamPerson | null) {
  if (person && !participantIds.value.includes(person.id) && participants.value.length < meetingRoomParticipantLimit) {
    participants.value.push({ id: person.id, name: person.fullName || person.email, avatarUrl: person.avatarUrl })
  }
}
function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = input.files?.[0]
  file.value = undefined
  validation.value = ''
  if (!selected) return
  if (!selected.size || selected.size > meetingRoomFileLimit) {
    validation.value = 'Выберите непустой файл размером до 10 МБ.'
    input.value = ''
    return
  }
  file.value = selected
}
function submit() {
  if (props.busy) return
  validation.value = ''
  if (!draft.title.trim() || !validDate(draft.date)) {
    validation.value = 'Укажите тему и дату встречи.'
    return
  }
  if (!validMeetingRoomTime(draft.start, draft.end)) {
    validation.value = 'Укажите время начала и окончания в пределах 10:00–19:00.'
    return
  }
  emit('submit', {
    ...draft, title: draft.title.trim(), participantIds: participantIds.value,
    ...(props.editing && { revision: props.editing.revision, removeAttachment: removeAttachment.value })
  }, file.value)
}
</script>

<template>
  <form :id="formId" class="grid gap-4" @submit.prevent="submit">
    <UFormField label="Тема встречи" required>
      <UInput v-model="draft.title" :maxlength="120" required :disabled="busy" class="w-full" />
    </UFormField>
    <UFormField label="Дата" required>
      <SharedDatePicker v-model="draft.date" :clearable="false" :disabled="busy" aria-label="Дата встречи" class="w-full" />
    </UFormField>
    <div class="grid grid-cols-2 gap-3">
      <UFormField label="Начало" required>
        <UInput v-model="draft.start" type="time" :min="meetingRoomOpens" :max="meetingRoomCloses" required :disabled="busy" class="w-full" />
      </UFormField>
      <UFormField label="Окончание" required>
        <UInput v-model="draft.end" type="time" :min="meetingRoomOpens" :max="meetingRoomCloses" required :disabled="busy" class="w-full" />
      </UFormField>
    </div>
    <UFormField label="Участники" hint="Необязательно">
      <UserPicker :key="participants.length" :excluded-ids="participantIds" :disabled="busy || participants.length >= meetingRoomParticipantLimit"
        @update:model-value="addParticipant" />
      <ul v-if="participants.length" class="mt-2 flex flex-wrap gap-2" aria-label="Отмеченные участники">
        <li v-for="person in participants" :key="person.id" class="max-w-full">
          <UButton :label="person.name" :aria-label="`Убрать: ${person.name}`" trailing-icon="i-lucide-x"
            color="neutral" variant="soft" size="xs" type="button" class="max-w-full" :disabled="busy" @click="participants = participants.filter(item => item.id !== person.id)" />
        </li>
      </ul>
    </UFormField>
    <UFormField label="Описание" hint="Необязательно">
      <UTextarea v-model="draft.notes" :maxlength="4000" :rows="3" :disabled="busy" class="w-full" />
    </UFormField>
    <UFormField label="Вложение" hint="До 10 МБ">
      <UCheckbox v-if="editing?.attachmentName && !file" v-model="removeAttachment" :label="`Удалить «${editing.attachmentName}»`" :disabled="busy" class="mb-2" />
      <UInput type="file" :disabled="busy" class="w-full" @change="chooseFile" />
    </UFormField>
    <UAlert v-if="validation || error" color="error" :description="validation || error" />
  </form>
</template>
