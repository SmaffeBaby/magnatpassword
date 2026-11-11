<script setup lang="ts">
// Layout and Nuxt UI chat primitives follow nuxt-ui-templates/chat (MIT).
import ChoiceCard from './Assistant/ChoiceCard.vue'
import ActionPanel from './Assistant/ActionPanel.vue'
import { useLocalAssistant } from '~/composables/useLocalAssistant'
const c = reactive(useLocalAssistant())
const team = useTeamStore(), auth = useAuthStore()
const person = computed(() => team.me?.person.id === auth.user?.id ? team.me?.person : null)
watch(() => c.open, open => { if (open) void team.refreshMe() })
const userPresentation = computed(() => ({
  ...(person.value?.avatarUrl ? { avatar: { src: person.value.avatarUrl, alt: person.value.fullName || 'Ваш аватар', icon: 'i-lucide-user-round' } } : { icon: 'i-lucide-user-round' }),
  ui: { content: 'whitespace-pre-wrap break-words leading-7' }
}))
const dragging = ref(false), fileInput = ref<HTMLInputElement | null>(null)
const quickChats = [
  { label: 'О моих проектах', icon: 'i-lucide-folder-kanban', prompt: 'Какие проекты мне доступны?' },
  { label: 'Новая задача', icon: 'i-lucide-list-plus', prompt: 'Создай задачу в Кабане: ' },
  { label: 'Связи подписок', icon: 'i-lucide-workflow', prompt: 'Как связан пароль с подписками?' },
  { label: 'Помощь по сайту', icon: 'i-lucide-compass', prompt: 'Какие разделы есть на сайте?' }
]
const capabilities = [
  { icon: 'i-lucide-compass', title: 'Объяснять сайт', text: 'Расскажу о разделах, кнопках и порядке работы. Учитываю открытую страницу.' },
  { icon: 'i-lucide-folder-kanban', title: 'Отвечать по проектам', text: 'Объясню формулы прибыли, НДС, выручки и рентабельности с подстановкой текущих сумм. Посчитаю числовое выражение, назову позиции сметы, сроки и участников проекта. Расскажу о договорах, входных данных, исполнении и закрытии по реальным отметкам.' },
  { icon: 'i-lucide-users-round', title: 'Показывать команду', text: 'Назову доступных сотрудников и их должности. Участников проекта покажу отдельно по вопросу о команде проекта.' },
  { icon: 'i-lucide-paperclip', title: 'Прикреплять файлы', text: 'Загружу файлы в выбранный договор, карточку входных данных или поле вложений задачи Кабана. До 20 МБ на файл. Место назначения выбираете вы.' },
  { icon: 'i-lucide-square-check-big', title: 'Работать с Кабаном', text: 'Подготовлю создание, редактирование или перемещение задачи. Можно менять доступные поля, чек-листы и ссылки. Срок и ответственных меняет создатель; права проверяет сервер.' },
  { icon: 'i-lucide-workflow', title: 'Объяснять взаимосвязи', text: 'Покажу связанные карточки и домены у сервиса с указанием явной связи или совпадения поля. Найду явные связи доступной карточки пароля с подписками, их стоимость и оплаченный срок. Совпадение названий не считаю доказательством связи.' },
  { icon: 'i-lucide-key-round', title: 'Готовить пароли', text: 'Составлю черновик карточки из переписки. При отсутствии пароля редактор создаст случайный. Сохранение — через обычную форму.' }
]
function choose(event: Event) { const input = event.target as HTMLInputElement; c.chooseFiles(Array.from(input.files || [])); input.value = '' }
function drop(event: DragEvent) { dragging.value = false; c.chooseFiles(Array.from(event.dataTransfer?.files || [])) }
function uploaded(file: File) { c.files = c.files.filter(item => item !== file) }
</script>
<template>
  <template v-if="c.visible">
    <UButton class="local-assistant-trigger" icon="i-lucide-sparkles" label="Помощник" size="lg" aria-label="Открыть локального помощника" @click="c.open = true" />
    <USlideover v-model:open="c.open" title="Помощник" description="Помощник по работе с сайтом" :ui="{ content: 'assistant-window w-full max-w-5xl', body: 'p-0 sm:p-0 flex min-h-0 overflow-hidden', header: 'shrink-0', description: 'sr-only' }">
      <template #title><span class="flex items-center gap-2"><UIcon name="i-lucide-sparkles" class="text-primary" />Помощник<span class="assistant-online" aria-label="Локальная модель" /></span></template>
      <template #body>
        <div class="assistant-shell" @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="drop">
          <div v-if="dragging" class="assistant-drop" @dragleave.prevent="dragging = false"><UIcon name="i-lucide-cloud-upload" /><strong>Прикрепите файлы к работе</strong><span>После выбора укажите место загрузки</span></div>
          <section class="assistant-chat" aria-label="Переписка с помощником">
            <div class="assistant-toolbar"><UButton label="Новый диалог" icon="i-lucide-square-pen" color="neutral" variant="ghost" :disabled="c.busy" @click="c.clear" /><UButton label="Что я умею" icon="i-lucide-circle-help" color="neutral" variant="ghost" @click="c.capabilities = true" /></div>
            <div class="assistant-scroll">
              <div v-if="!c.messages.length" class="assistant-welcome"><span class="assistant-welcome-icon"><UIcon name="i-lucide-sparkles" /></span><h2>Чем помочь в работе?</h2><p>Спросите о проекте, поручите задачу или прикрепите документ.</p><div class="assistant-quick"><UButton v-for="quick in quickChats" :key="quick.label" :label="quick.label" :icon="quick.icon" color="neutral" variant="outline" class="rounded-full" @click="c.prompt = quick.prompt" /></div></div>
              <UChatMessages v-else :messages="c.chatMessages" :status="c.status" should-auto-scroll :assistant="{ icon: 'i-lucide-sparkles', ui: { content: 'whitespace-pre-wrap break-words leading-7' } }" :user="userPresentation">
                <template #indicator><div class="assistant-thinking" role="status"><span class="assistant-dots"><i /><i /><i /></span><span v-if="c.queueStatus?.state === 'queued'" class="assistant-queue-label">Ожидаю модель · место в очереди: {{ c.queueStatus.position }}<small>Перед вами {{ c.queueStatus.position }} {{ c.queueStatus.position === 1 ? 'запрос' : c.queueStatus.position < 5 ? 'запроса' : 'запросов' }}. Можно отменить ожидание кнопкой остановки.</small></span><UChatShimmer v-else text="Готовлю ответ…" /></div></template>
              </UChatMessages>
              <nav v-if="c.links.length" class="assistant-links" aria-label="Разделы по вопросу"><UButton v-for="link in c.links" :key="link.to + link.label" :to="link.to" :label="link.label" trailing-icon="i-lucide-arrow-up-right" color="neutral" variant="outline" size="xs" @click="c.open = false" /></nav>
              <div v-if="c.draft" class="assistant-draft"><div><UIcon name="i-lucide-key-round" /><strong>{{ c.draft.title }}</strong></div><span>{{ c.draft.username || 'Логин не указан' }}</span><span>{{ c.draft.url }}</span><small>{{ c.draft.password ? 'Пароль указан' : 'Пароль будет сгенерирован в редакторе' }}</small><UButton label="Проверить и добавить в связку" icon="i-lucide-arrow-up-right" @click="c.review" /></div>
              <ChoiceCard v-if="c.choice" :choice="c.choice" :disabled="c.busy || c.contextBusy" @select="c.selectChoice" />
              <ActionPanel v-if="c.action" :key="c.action.kind + c.action.taskName + c.action.title" :action="c.action" :context="c.context" :files="c.files" :project-id="c.projectId" :vault-id="c.vaultId" :context-busy="c.contextBusy" @vault="c.changeVault" @project="c.projectId = $event" @cancel="c.action = null" @done="c.actionDone" @message="c.addMessage($event)" @uploaded="uploaded" @refresh="c.loadContext" />
              <UAlert v-if="c.error" color="error" :description="c.error" class="my-4" />
            </div>
            <footer class="assistant-composer">
              <UChatPrompt v-model="c.prompt" variant="subtle" placeholder="Напишите вопрос или поручение…" aria-label="Сообщение помощнику" :maxlength="3000" :disabled="c.busy" :autofocus="false" @submit="c.send()">
                <template v-if="c.files.length" #header><div class="assistant-file-chips"><span v-for="(file, index) in c.files" :key="index"><UIcon name="i-lucide-file" />{{ file.name }}<UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" :aria-label="`Убрать файл ${file.name}`" @click="c.files.splice(index, 1)" /></span></div></template>
                <template #footer><div class="flex items-center gap-1"><UButton icon="i-lucide-paperclip" aria-label="Выбрать файлы" color="neutral" variant="ghost" :disabled="c.busy" @click="fileInput?.click()" /><span class="assistant-model-label">Qwen3 · 0.6B</span></div><UChatPromptSubmit :status="c.status" :disabled="!c.prompt.trim()" color="neutral" size="sm" :aria-label="c.queueStatus?.state === 'queued' ? 'Отменить ожидание' : c.busy ? 'Остановить ответ' : 'Отправить сообщение'" @stop="c.stop" /></template>
              </UChatPrompt>
              <input ref="fileInput" type="file" multiple class="sr-only" aria-label="Файлы для прикрепления" @change="choose" />
              <p>Действия выполняются после проверки параметров. Модель работает локально.</p>
            </footer>
          </section>
        </div>
      </template>
    </USlideover>
    <UModal v-model:open="c.capabilities" title="Что я умею" description="Помощник для работы в Magnat и Light" :ui="{ content: 'max-w-2xl' }"><template #body><div class="assistant-capabilities"><article v-for="item in capabilities" :key="item.title"><UIcon :name="item.icon" /><div><h3>{{ item.title }}</h3><p>{{ item.text }}</p></div></article></div><p class="mt-6 text-sm text-muted">Если нет доступа к записи или функции, помощник не сможет обойти ограничение. Если для запроса нужен проект, хранилище или карточка, помощник предложит выбор прямо в диалоге.</p></template></UModal>
  </template>
</template>
<style scoped>
.local-assistant-trigger{position:fixed;right:24px;bottom:max(24px,env(safe-area-inset-bottom));z-index:40;box-shadow:0 8px 30px #17233222;border-radius:24px}.assistant-online{width:7px;height:7px;border-radius:50%;background:#22c55e}.assistant-shell{display:flex;width:100%;height:100%;min-height:0;position:relative}.assistant-chat{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--ui-bg)}.assistant-toolbar{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--ui-border);padding:8px 16px}.assistant-scroll{flex:1;min-height:0;overflow:auto;padding:24px clamp(16px,3vw,36px);scroll-behavior:smooth}.assistant-composer{flex-shrink:0;padding:10px 24px 16px;background:var(--ui-bg)}.assistant-composer>p{text-align:center;font-size:10px;color:var(--ui-text-muted);margin-top:10px}.assistant-model-label{font-size:10px;color:var(--ui-text-muted);padding-inline:6px}.assistant-welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:330px;text-align:center;gap:16px}.assistant-welcome-icon{display:grid;place-items:center;width:60px;height:60px;border:1px solid var(--ui-border);border-radius:20px;box-shadow:0 8px 24px #17233208;color:var(--ui-primary);font-size:28px}.assistant-welcome h2{font-size:27px;letter-spacing:-.7px;font-weight:600}.assistant-welcome p{font-size:14px;line-height:1.7;color:var(--ui-text-muted);max-width:340px}.assistant-quick{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:12px}.assistant-links{display:flex;flex-wrap:wrap;gap:8px;margin-block:18px}.assistant-draft{display:flex;flex-direction:column;gap:10px;padding:18px;border:1px solid var(--ui-border);border-radius:16px;margin-block:18px;overflow-wrap:anywhere}.assistant-draft>div{display:flex;align-items:center;gap:10px}.assistant-draft>span,.assistant-draft>small{font-size:13px;color:var(--ui-text-muted)}.assistant-context-note{display:flex;gap:8px;font-size:11px;line-height:1.7;color:var(--ui-text-muted)}.assistant-context-note>.iconify{font-size:18px;flex-shrink:0}.assistant-queue-label{display:flex;flex-direction:column;gap:5px}.assistant-queue-label small{font-size:11px;font-weight:400}.assistant-thinking{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ui-text-muted)}.assistant-dots{display:flex;gap:4px}.assistant-dots i{width:5px;height:5px;border-radius:50%;background:var(--ui-primary);animation:assistant-pulse 1.3s ease-in-out infinite}.assistant-dots i:nth-child(2){animation-delay:.15s}.assistant-dots i:nth-child(3){animation-delay:.3s}@keyframes assistant-pulse{0%,70%,100%{opacity:.3;transform:translateY(0)}35%{opacity:1;transform:translateY(-3px)}}.assistant-file-chips{display:flex;flex-wrap:wrap;gap:8px;padding:10px}.assistant-file-chips>span{display:flex;align-items:center;gap:6px;font-size:12px;padding:4px 8px;background:var(--ui-bg);border:1px solid var(--ui-border);border-radius:8px;overflow-wrap:anywhere;max-width:100%}.assistant-drop{position:absolute;inset:12px;z-index:10;background:color-mix(in srgb,var(--ui-bg) 95%,transparent);border:2px dashed var(--ui-primary);border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}.assistant-drop>.iconify{font-size:42px;color:var(--ui-primary)}.assistant-drop>span{font-size:13px;color:var(--ui-text-muted)}.assistant-capabilities{display:grid;gap:24px}.assistant-capabilities article{display:flex;gap:14px}.assistant-capabilities article>.iconify{font-size:23px;flex-shrink:0;color:var(--ui-primary)}.assistant-capabilities h3{font-size:15px;font-weight:600;margin-bottom:6px}.assistant-capabilities p,.assistant-warnings{font-size:12px;line-height:1.8;color:var(--ui-text-muted)}@media(max-width:899px){.assistant-composer{padding:10px 14px 16px}.assistant-model-label{display:none}.assistant-welcome h2{font-size:24px}}@media(prefers-reduced-motion:reduce){.assistant-dots i{animation:none}.assistant-scroll{scroll-behavior:auto}}
</style>
