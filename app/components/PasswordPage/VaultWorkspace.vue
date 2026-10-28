<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import PasswordHeader from './PasswordHeader.vue'
import BrandLogo from '../BrandLogo.vue'
import CategoryBrowser from './CategoryBrowser.vue'
import CategoryNav from './CategoryNav.vue'
import CredentialAccountEditor from './CredentialAccountEditor.vue'
import CredentialDetails from './CredentialDetails.vue'
import CredentialTile from './CredentialTile.vue'
import NotificationCenter from '../NotificationCenter.vue'
import SubscriptionCalendar from './SubscriptionCalendar.vue'
import SubscriptionEditor from './SubscriptionEditor.vue'
import SubscriptionHistory from './SubscriptionHistory.vue'
import SubscriptionUpcoming from './SubscriptionUpcoming.vue'
import VaultSwitcher from './VaultSwitcher.vue'
import PersonAvatar from '../PersonAvatar.vue'
import { useScrollTopbar } from '../../composables/useScrollTopbar'
import { useVaultWorkspace } from '../../composables/useVaultWorkspace'
const LazyTeamWorkspace=defineAsyncComponent(()=>import('./TeamWorkspace.vue'))
const LazyProfileView=defineAsyncComponent(()=>import('./ProfileView.vue'))
const LazyRelationshipExplorer = defineAsyncComponent(() => import('./RelationshipExplorer.vue'))
const LazySubscriptionFinances = defineAsyncComponent(() => import('./SubscriptionFinances.vue'))

import type { ScopedCategory } from '~~/shared/utils/vault-sources'
const props = defineProps<{ embedded?: boolean; mode?: string }>()
const {
  canEditEntry,
  folderCategoryOptions,
  linkedFolderCategories,
  navigationCategories,
  selectCategory,
  folderOpen,
  folderVaultId,
  folderForm,
  folderError,
  folderDeleteOpen,
  deletingFolder,
  folders,
  editFolder,
  uploadFolderSvg,
  saveFolder,
  askDeleteFolder,
  removeFolder,
  toggleFolder,
  folderMediaError,
  filters,
  canManageCategoryVault,
  structureVaultOptions,
  categoriesEditable,
  folderOptions,
  selectedFolder,
  historyOpen,
  historyKey,
  historyMode,
  openPaymentHistory,
  sources,
  subscriptionCards,
  mediaError,
  mediaBusy,
  svgImageUrl,
  targetVaultIds,
  sharingEditable,
  setTargetVaults,
  addAccount,
  removeAccount,
  uploadImages,
  uploadCategorySvg,
  viewOpen,
  viewingEntry,
  viewingCategories,
  viewingLinks,
  viewEntry,
  entryCategories,
  upcomingMode,
  financesMode,
  visibleSources,
  subscriptionOpen,
  subscriptionDraft,
  subscriptionError,
  editSubscription,
  applySubscription,
  calendarMode,
  subscriptionCount,
  changeFieldType,
  renewSubscription,
  openNotification,
  graphMode,
  allEntries,
  relationTargets,
  fieldTypes,
  sourceFieldOptions,
  incomingLinks,
  addCustomField,
  removeCustomField,
  addLink,
  removeLink,
  linkTarget,
  setLinkTarget,
  targetFieldOptions,
  vault,
  auth,
  shared,
  workspaceId,
  workspaceName,
  entries,
  categories,
  busy,
  error,
  categoryVaultId,
  vaultOptions,
  categoryCount,
  active,
  query,
  sort,
  mobileOpen,
  entryOpen,
  categoryOpen,
  deleteOpen,
  deleting,
  deletingCategory,
  formError,
  form,
  categoryForm,
  colors,
  icons,
  categoryOptions,
  selectedCategory,
  favorites,
  category,
  title,
  filtered,
  categoryMode,
  editEntry,
  editCategory,
  select,
  saveEntry,
  saveCategory,
  favorite,
  askDelete,
  remove,
  copy,
  productName
 } = useVaultWorkspace(props)
const categoryRequired = computed(() => targetVaultIds.value.some((id: string) => !canManageCategoryVault(id)))
function askDeleteCategory(category: ScopedCategory) { askDelete(category, true) }
const team=useTeamStore(),route=useRoute()
onMounted(()=>team.refreshMe())
const profileId=computed(()=>typeof route.params.id==='string'?route.params.id:undefined)
const { topbarHidden, resetTopbar } = useScrollTopbar()
watch(active, () => { if (import.meta.client) resetTopbar() })
function openStructureVault(id: string) { workspaceId.value = id; select('all') }
function removeImage(id: string) { form.images = form.images?.filter(image => image.id !== id) }
</script>
<template>
  <div :class="['vault-shell', { embedded }]">
    <aside v-if="!embedded" :class="['vault-sidebar', { 'is-open': mobileOpen }]">
      <BrandLogo />
      <VaultSwitcher v-model="workspaceId" />
      <p class="sidebar-label">ХРАНИЛИЩЕ</p>
      <nav class="vault-nav" aria-label="Хранилище">
        <button :class="{ selected: active === 'all' }" @click="select('all')"><UIcon name="i-lucide-layout-grid" />Все карточки<span class="nav-count">{{ entries.length }}</span></button>
        <button :class="{ selected: active === 'favorites' }" @click="select('favorites')"><UIcon name="i-lucide-star" />Избранное<span class="nav-count">{{ favorites }}</span></button>
        <button :class="{ selected: graphMode }" @click="select('relationships')"><UIcon name="i-lucide-network" />Взаимосвязь</button>
        <button :class="{ selected: calendarMode }" @click="select('subscriptions')"><UIcon name="i-lucide-calendar-days" />Календарь подписок<span class="nav-count">{{ subscriptionCount }}</span></button>
        <button :class="{ selected: upcomingMode }" @click="select('upcoming')"><UIcon name="i-lucide-clock-3" />Ближайшие подписки</button>
        <button :class="{ selected: financesMode }" @click="select('finances')"><UIcon name="i-lucide-chart-no-axes-combined" />Финансы</button>
        <button :class="{ selected: historyMode }" @click="select('history')"><UIcon name="i-lucide-history" />История списаний</button>
        <button :class="{selected:active==='team'}" @click="select('team')"><UIcon name="i-lucide-users-round"/>Команда</button>
        <button :class="{selected:active==='profile'}" @click="select('profile')"><UIcon name="i-lucide-user-round-cog"/>Мой профиль</button>
      </nav>
      <div class="sidebar-label category-label"><button class="category-page-link" :class="{selected:categoryMode}" @click="select('categories')">КАТЕГОРИИ</button><button v-if="workspaceId==='all'||canManageCategoryVault(workspaceId)" title="Добавить категорию" aria-label="Добавить категорию" @click="editCategory()"><UIcon name="i-lucide-plus"/></button></div>
      <CategoryNav :categories="navigationCategories" :folders="folders" :active="active" :workspace-id="workspaceId" :collapsed="filters.collapsedFolders" :count="categoryCount" @select="selectCategory" @toggle="toggleFolder"/>
      <button v-if="workspaceId==='all'||canManageCategoryVault(workspaceId)" class="add-category" @click="editCategory()"><UIcon name="i-lucide-plus" />Новая категория</button>

      <div class="sidebar-bottom"><div class="encryption-card"><span class="encryption-icon"><UIcon name="i-lucide-shield-check" /></span><strong>Под надёжной защитой</strong><p>Личное — только для вас.<br>Общее — для участников.</p><span class="encryption-tag"><i /> AES-256-GCM</span></div><NuxtLink to="/admin/password" class="sidebar-admin"><UIcon name="i-lucide-settings-2" />Панель управления<UIcon name="i-lucide-arrow-up-right" /></NuxtLink><div class="sidebar-user"><NuxtLink to="/password/profile" class="sidebar-profile"><PersonAvatar :name="team.me?.person.fullName||auth.user?.email||'Профиль'" :src="team.me?.person.avatarUrl"/><span><strong>{{ team.me?.person.fullName||'Мой профиль' }}</strong><small>{{ auth.user?.email }}</small></span></NuxtLink><button title="Выйти" aria-label="Выйти" @click="auth.logout()"><UIcon name="i-lucide-log-out"/></button></div></div>
    </aside>
    <button v-if="mobileOpen" class="sidebar-scrim" aria-label="Закрыть меню" @click="mobileOpen = false" />
    <main class="vault-main">
      <header v-if="!embedded" class="vault-topbar password-topbar" :class="{ 'is-hidden': topbarHidden && !mobileOpen }"><PasswordHeader :workspace-name="workspaceName" :title="title" @toggle-menu="mobileOpen = !mobileOpen" @open-entry="openNotification" /></header>
      <div class="vault-content">
        <slot />
        <div v-if="embedded" class="embedded-switcher"><VaultSwitcher v-model="workspaceId" /><NotificationCenter @open-entry="openNotification" /></div>
        <LazyTeamWorkspace v-if="active==='team'" :profile-id="profileId"/>
        <LazyProfileView v-else-if="active==='profile'"/>
        <template v-else>
        <UAlert v-if="shared.loading && !shared.groups.length" class="mb-5" color="neutral" title="Загружаем общие хранилища…" />
        <div v-if="!embedded" class="welcome-line"><span class="eyebrow">ПОРЯДОК В ЦИФРОВОЙ ЖИЗНИ</span><span class="vault-date">Ваше безопасное пространство</span></div>
        <div class="page-heading"><div><h1>{{ categoryMode ? 'Категории' : title }}<span class="title-dot">.</span></h1><p>{{ categoryMode ? 'Организуйте доступы так, как удобно вам.' : graphMode ? 'Как связаны сервисы, хостинги и подписки.' : historyMode ? 'Прошлые оплаты подписок для отчётов.' : financesMode ? 'Расходы на подписки, план списаний и отмеченные оплаты.' : upcomingMode ? 'Сроки подписок и предстоящие продления во всех хранилищах.' : 'Все важные доступы — в одном надёжном месте.' }}</p></div><div class="heading-actions"><UButton v-if="category(active) && !categoryMode && canManageCategoryVault(category(active)!.vaultId)" color="neutral" variant="outline" icon="i-lucide-pencil" aria-label="Изменить категорию" @click="editCategory(category(active))" /><UButton v-if="category(active) && !categoryMode && canManageCategoryVault(category(active)!.vaultId)" color="neutral" variant="outline" icon="i-lucide-trash-2" aria-label="Удалить категорию" @click="askDelete(category(active)!, true)" /><UButton v-if="categoryMode&&(workspaceId==='all'||canManageCategoryVault(workspaceId))" color="neutral" variant="outline" icon="i-lucide-folder-plus" label="Новая папка" @click="editFolder()"/><UButton v-if="(!categoryMode||workspaceId==='all'||canManageCategoryVault(workspaceId))&&(workspaceId==='all'||workspaceId==='personal'||shared.groups.find(group=>group.id===workspaceId)?.canEdit!==false)" size="lg" icon="i-lucide-plus" :label="categoryMode ? 'Новая категория' : 'Добавить карточку'" @click="categoryMode ? editCategory() : editEntry()" /></div></div>
        <div v-if="!embedded && !financesMode && !upcomingMode && !historyMode && !graphMode" class="stats-grid"><div class="stat"><span class="stat-icon violet"><UIcon name="i-lucide-key-round" /></span><div><small>Всего карточек</small><strong>{{ entries.length.toString().padStart(2, '0') }}</strong></div><span class="stat-caption">В вашем хранилище</span></div><div class="stat"><span class="stat-icon amber"><UIcon name="i-lucide-star" /></span><div><small>В избранном</small><strong>{{ favorites.toString().padStart(2, '0') }}</strong></div><span class="stat-caption">Всегда под рукой</span></div><div class="stat"><span class="stat-icon green"><UIcon name="i-lucide-folders" /></span><div><small>Категорий</small><strong>{{ categories.length.toString().padStart(2, '0') }}</strong></div><span class="stat-caption">Всё на своих местах</span></div></div>
        <UAlert v-if="error" class="mb-5" color="error" variant="soft" :description="error" />
        <SubscriptionUpcoming v-if="upcomingMode" :entries="entries" :busy="busy" @edit="viewEntry" @renew="renewSubscription" />
        <LazySubscriptionFinances v-else-if="financesMode" :sources="visibleSources" @edit="viewEntry" />
        <SubscriptionHistory v-else-if="historyMode" :sources="visibleSources"/>
        <SubscriptionCalendar v-else-if="calendarMode" :sources="visibleSources" :entries="entries" :busy="busy" @edit="viewEntry" @renew="renewSubscription" />
        <LazyRelationshipExplorer v-else-if="graphMode" :entries="entries" :sources="visibleSources" @open="viewEntry" @category="selectCategory" @vault="openStructureVault" />
        <CategoryBrowser v-else-if="categoryMode" :categories="navigationCategories" :folders="folders" :count="categoryCount" :can-manage="canManageCategoryVault" @open="selectCategory" @edit="editCategory" @remove="askDeleteCategory" @edit-folder="editFolder" @remove-folder="askDeleteFolder"/>
        <template v-else>
          <div class="filter-bar"><UInput v-model="query" icon="i-lucide-search" placeholder="Найти карточку, сайт или логин…" aria-label="Поиск по хранилищу" size="lg" class="vault-search" /><div class="filter-right"><span>{{ filtered.length }} записей</span><USelect v-model="sort" :items="[{ label: 'Сначала новые', value: 'updated' }, { label: 'По названию', value: 'title' }]" aria-label="Сортировка" size="lg" /></div></div>
          <div v-if="filtered.length" class="credential-grid compact-credential-grid"><CredentialTile v-for="entry in filtered" :key="entry.sharedCardId||`${entry.vaultId}/${entry.id}`" :entry="entry" :categories="entryCategories(entry)" :busy="busy" :readonly="!canEditEntry(entry)" @open="viewEntry" @edit="editEntry" @favorite="favorite" @delete="askDelete"/><button v-if="workspaceId==='all'||workspaceId==='personal'||shared.groups.find(group=>group.id===workspaceId)?.canEdit!==false" class="new-card" @click="editEntry()"><span><UIcon name="i-lucide-plus"/></span><strong>Новая карточка</strong><span class="new-card-description">Доступы, подписки и важная информация</span></button></div>
          <div v-else class="empty-vault"><div class="empty-illustration"><div class="orbit orbit-one" /><div class="orbit orbit-two" /><span class="floating-key"><UIcon name="i-lucide-key-round" /></span><span class="empty-lock"><UIcon name="i-lucide-lock-keyhole" /></span><span class="floating-check"><UIcon name="i-lucide-check" /></span></div><span class="eyebrow">{{ query ? 'ПОИСК ПО ХРАНИЛИЩУ' : 'НАЧНИТЕ С ПЕРВОГО СЕКРЕТА' }}</span><h2>{{ query ? 'Ничего не нашлось' : active === 'favorites' ? 'Самое важное — рядом' : 'Здесь будут ваши карточки' }}</h2><p>{{ query ? 'Попробуйте другое название, логин или адрес сайта.' : active === 'favorites' ? 'Нажмите на звёздочку в карточке, чтобы добавить её в избранное.' : 'Добавьте первый доступ к сайту или приложению. Мы позаботимся о порядке и защите.' }}</p><UButton v-if="!query && active !== 'favorites'" size="lg" icon="i-lucide-plus" label="Добавить первую карточку" @click="editEntry()" /><UButton v-if="query" color="neutral" variant="outline" label="Сбросить поиск" @click="query = ''" /><div class="empty-features"><span><UIcon name="i-lucide-shield-check" />Шифрование данных</span><span><UIcon name="i-lucide-folder" />Удобные категории</span><span><UIcon name="i-lucide-sparkles" />Генератор паролей</span></div></div>
        </template>
        <div v-if="!embedded" class="vault-tip"><span><UIcon name="i-lucide-lightbulb" /></span><p><strong>Маленькая привычка — большая защита.</strong> Используйте уникальный пароль для каждого сервиса. Генератор поможет его придумать.</p><UIcon name="i-lucide-sparkles" /></div>
        <footer v-if="!embedded" class="vault-footer"><span>{{ productName }} <span class="footer-divider">/</span> Личное — для вас. Общее — для команды.</span><span><UIcon name="i-lucide-lock-keyhole" />Выход через 5 минут бездействия</span></footer>
        </template>
      </div>
    </main>
    <CredentialDetails @open-entry="viewEntry" :open="viewOpen" :entry="viewingEntry" :subscription-entries="allEntries" :categories="viewingCategories" :links="viewingLinks" :busy="busy" :readonly="!!viewingEntry&&!canEditEntry(viewingEntry)" @close="viewOpen=false" @edit="editEntry" @copy="copy" @renew="renewSubscription" @history="openPaymentHistory"/>
    <USlideover v-model:open="historyOpen" title="История списаний" description="Оплаты выбранной подписки." :ui="{content:'w-full sm:max-w-4xl',body:'min-w-0 overflow-y-auto'}"><template #body><SubscriptionHistory v-if="historyOpen" :sources="sources" :subscription-key="historyKey"/></template></USlideover>
    <UModal v-model:open="entryOpen" :title="form.id ? 'Изменить карточку' : 'Новая карточка'" description="Данные будут зашифрованы перед сохранением." :dismissible="!busy" :ui="{content:'sm:max-w-3xl',body:'min-w-0 overflow-y-auto'}">
      <template #body><form id="entry-form" class="space-y-4" @submit.prevent="saveEntry"><UFormField label="Хранилища" required><USelectMenu :model-value="targetVaultIds" :items="vaultOptions" value-key="value" multiple class="w-full" :disabled="!sharingEditable" aria-label="Хранилища карточки" @update:model-value="values=>setTargetVaults(values)"/><p class="mt-2 text-xs text-slate-500">{{ targetVaultIds.includes('personal')?'Личная карточка доступна только вам.':'Одна карточка будет доступна участникам всех выбранных хранилищ. Изменения синхронизируются.' }}</p><p v-if="!sharingEditable" class="mt-2 text-xs text-slate-500">Состав хранилищ меняет создатель карточки с доступом ко всем её хранилищам.</p></UFormField><UFormField label="Название" required><UInput v-model="form.title" placeholder="Например, Яндекс" class="w-full" required :maxlength="120" /></UFormField><UFormField label="Адрес сайта"><UInput v-model="form.url" placeholder="https://example.com" class="w-full" :maxlength="2000" /></UFormField><UFormField label="Категории" :required="categoryRequired"><USelectMenu v-model="selectedCategory" :disabled="!categoriesEditable" :items="categoryOptions" value-key="value" multiple class="w-full" aria-label="Категории карточки" placeholder="Без категорий"/><p v-if="!categoriesEditable" class="mt-2 text-xs text-slate-500">Категории этой карточки меняет участник с полным доступом.</p></UFormField><section class="entry-extra-section"><div class="entry-section-heading"><h3>Доступы</h3><UButton type="button" size="xs" variant="soft" icon="i-lucide-plus" label="Добавить доступ" :disabled="(form.accounts?.length||0)>=30" @click="addAccount"/></div><p v-if="!form.accounts?.length" class="subscription-note">Логин и пароль необязательны. Для нескольких серверов добавьте отдельные именованные блоки.</p><CredentialAccountEditor v-for="account in form.accounts" :key="account.id" :account="account" @remove="removeAccount(account.id)"/></section><UFormField label="Заметка"><UTextarea v-model="form.notes" class="w-full" placeholder="Дополнительная информация" :maxlength="10000" /></UFormField><section class="entry-extra-section"><h3 class="text-sm font-semibold">Изображения</h3><label class="media-upload-label">Прикрепить JPEG / PNG<input type="file" accept="image/jpeg,image/png" multiple :disabled="mediaBusy||(form.images?.length||0)>=5" @change="uploadImages"/></label><p class="subscription-note">До 5 изображений, исходный файл до 10 МБ. Изображения уменьшаются для хранения в зашифрованной карточке.</p><div class="editor-image-list"><figure v-for="image in form.images" :key="image.id"><img :src="image.data" :alt="image.name"/><figcaption>{{ image.name }}</figcaption><UButton type="button" size="xs" color="neutral" variant="outline" label="Удалить изображение" @click="removeImage(image.id)"/></figure></div><UAlert v-if="mediaError" class="mt-3" color="error" :description="mediaError"/></section><section class="entry-extra-section"><div class="entry-section-heading"><h3>Дополнительные поля</h3><UButton type="button" size="xs" variant="soft" icon="i-lucide-plus" label="Добавить поле" :disabled="(form.customFields?.length || 0) >= 24" @click="addCustomField" /></div><div v-for="field in form.customFields" :key="field.id" class="entry-custom-field"><UInput v-model="field.label" required placeholder="Название поля" :maxlength="60" aria-label="Название дополнительного поля" /><USelect :model-value="field.type" :items="fieldTypes" aria-label="Тип дополнительного поля" @update:model-value="value => changeFieldType(field, String(value))" /><UInput v-if="field.type !== 'subscription'" v-model="field.value" :type="field.type === 'secret' ? 'password' : 'text'" placeholder="Значение" :maxlength="4000" aria-label="Значение дополнительного поля" /><UButton v-if="field.type === 'subscription'" type="button" class="subscription-settings-button" icon="i-lucide-settings-2" color="neutral" variant="outline" label="Настроить подписку" @click="editSubscription(field)" /><UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Удалить поле" @click="removeCustomField(field.id)" /></div></section>
<section class="entry-extra-section"><div class="entry-section-heading"><h3>Связи с карточками и полями</h3><UButton type="button" size="xs" variant="soft" icon="i-lucide-link" label="Добавить связь" :disabled="(form.links?.length || 0) >= 50" @click="addLink" /></div><div v-for="link in form.links" :key="link.id" class="entry-link"><USelect :model-value="linkTarget(link)" :items="relationTargets" class="w-full" aria-label="Связанная карточка" @update:model-value="value => setLinkTarget(link, String(value))" /><div class="entry-link-fields"><USelect v-model="link.sourceFieldId" :items="sourceFieldOptions" aria-label="Исходное поле" /><span aria-hidden="true">→</span><USelect v-model="link.targetFieldId" :items="targetFieldOptions(link)" aria-label="Поле связанной карточки" /></div><div class="flex gap-2"><UInput v-model="link.label" placeholder="Описание связи, например «Хостинг сайта»" :maxlength="100" class="flex-1" aria-label="Описание связи" /><UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Удалить связь" @click="removeLink(link.id)" /></div></div><p class="mt-3 text-xs leading-5 text-slate-500">Связь не выдаёт доступ к другой карточке. На графе она видна только тем, кому доступны обе записи.</p><div v-if="incomingLinks.length" class="mt-4"><h4 class="text-xs font-medium">Входящие связи</h4><p v-for="link in incomingLinks" :key="link.key" class="mt-2 text-xs text-slate-500">{{ link.title }} · {{ link.vaultName }}{{ link.label ? ' — ' + link.label : '' }}</p></div></section>
<UCheckbox v-model="form.favorite" label="Добавить в избранное" /><UAlert v-if="formError || error" color="error" :description="formError || error" /></form></template>
      <template #footer><div class="flex w-full justify-end gap-2"><UButton color="neutral" variant="outline" label="Отмена" :disabled="busy" @click="entryOpen = false" /><UButton type="submit" form="entry-form" label="Сохранить карточку" :loading="busy || mediaBusy" /></div></template>
    </UModal>
    <UModal v-model:open="subscriptionOpen" title="Настройка подписки" description="Примените настройки, затем сохраните карточку сервиса." :ui="{ content: 'subscription-settings-modal sm:max-w-2xl', body: 'min-w-0 overflow-y-auto', footer: 'justify-end flex-wrap' }">
      <template #body><form v-if="subscriptionDraft" id="subscription-settings-form" class="subscription-settings-form" @submit.prevent="applySubscription"><SubscriptionEditor :field="subscriptionDraft" :cards="subscriptionCards" :owner-title="form.title || 'Текущая карточка'" /><UAlert v-if="subscriptionError" class="mt-4" color="error" :description="subscriptionError" /></form></template>
      <template #footer><UButton color="neutral" variant="outline" label="Отмена" @click="subscriptionOpen = false" /><UButton type="submit" form="subscription-settings-form" label="Применить" /></template>
    </UModal>
    <UModal v-model:open="categoryOpen" :title="categoryForm.id ? 'Изменить категорию' : 'Новая категория'" description="Соберите похожие доступы вместе.">
      <template #body><form id="category-form" class="space-y-5" @submit.prevent="saveCategory"><UFormField label="Хранилище" required><USelect v-model="categoryVaultId" :items="structureVaultOptions" :disabled="!!categoryForm.id" class="w-full" /></UFormField><UFormField label="Папка"><USelect v-model="selectedFolder" :items="folderOptions" class="w-full"/></UFormField><UFormField label="Название" required><UInput v-model="categoryForm.name" class="w-full" placeholder="Например, Покупки" required :maxlength="60" /></UFormField><UFormField label="Цвет"><div class="flex gap-3"><button v-for="color in colors" :key="color" type="button" :aria-label="color" :aria-pressed="categoryForm.color === color" class="color-swatch" :style="{ background: color, outline: categoryForm.color === color ? `2px solid ${color}` : 'none' }" @click="categoryForm.color = color"><UIcon v-if="categoryForm.color === color" name="i-lucide-check" /></button></div></UFormField><UFormField label="Иконка"><label class="media-upload-label">Загрузить свою SVG<input type="file" accept="image/svg+xml,.svg" @change="uploadCategorySvg"/></label><div v-if="categoryForm.svg" class="flex items-center gap-3 my-3"><img :src="svgImageUrl(categoryForm.svg)" class="category-upload-preview" alt="Иконка категории"/><UButton type="button" color="neutral" variant="outline" size="xs" label="Убрать SVG" @click="categoryForm.svg=undefined"/></div><UAlert v-if="mediaError" color="error" :description="mediaError"/><div class="flex flex-wrap gap-2"><UButton v-for="icon in icons" :key="icon" type="button" :icon="icon" :aria-label="icon" :color="categoryForm.icon === icon ? 'primary' : 'neutral'" :variant="categoryForm.icon === icon ? 'soft' : 'outline'" @click="categoryForm.icon = icon; categoryForm.svg=undefined" /></div></UFormField><UAlert v-if="formError || error" color="error" :description="formError || error" /></form></template><template #footer><UButton type="submit" form="category-form" label="Сохранить категорию" :loading="busy" /></template>
    </UModal>
    <UModal v-model:open="folderOpen" :title="folderForm.id?'Изменить папку':'Новая папка'" description="Папка может объединять категории из разных хранилищ. Доступ к ним определяется правами каждого участника."><template #body><form id="folder-form" class="space-y-5" @submit.prevent="saveFolder"><UFormField label="Хранилище" required><USelect v-model="folderVaultId" :items="structureVaultOptions" :disabled="!!folderForm.id" class="w-full"/></UFormField><UFormField label="Название папки" required><UInput v-model="folderForm.name" :maxlength="60" required class="w-full" placeholder="Например, Проекты"/></UFormField><UFormField label="Категории из других хранилищ" description="Добавьте ссылки на доступные категории. Права доступа к ним не изменятся."><USelectMenu v-model="linkedFolderCategories" :items="folderCategoryOptions" value-key="value" multiple searchable class="w-full" placeholder="Выберите категории"/></UFormField><UFormField label="Цвет"><div class="flex flex-wrap gap-3"><button v-for="color in colors" :key="color" type="button" :aria-label="color" :aria-pressed="folderForm.color===color" class="color-swatch" :style="{background:color,outline:folderForm.color===color?`2px solid ${color}`:'none'}" @click="folderForm.color=color"><UIcon v-if="folderForm.color===color" name="i-lucide-check"/></button></div></UFormField><UFormField label="Иконка папки"><label class="media-upload-label">Загрузить свою SVG<input type="file" accept="image/svg+xml,.svg" @change="uploadFolderSvg"/></label><div v-if="folderForm.svg" class="flex items-center gap-3 my-3"><img :src="svgImageUrl(folderForm.svg)" class="category-upload-preview" alt="Иконка папки"/><UButton type="button" color="neutral" variant="outline" size="xs" label="Убрать SVG" @click="folderForm.svg=undefined"/></div><div class="flex flex-wrap gap-2 mt-3"><UButton v-for="icon in icons" :key="icon" type="button" :icon="icon" :aria-label="icon" :color="folderForm.icon===icon?'primary':'neutral'" :variant="folderForm.icon===icon?'soft':'outline'" @click="folderForm.icon=icon;folderForm.svg=undefined"/></div></UFormField><UAlert v-if="folderError||folderMediaError||error" color="error" :description="folderError||folderMediaError||error"/></form></template><template #footer><UButton color="neutral" variant="outline" label="Отмена" @click="folderOpen=false"/><UButton type="submit" form="folder-form" label="Сохранить папку" :loading="busy"/></template></UModal>
    <UModal v-model:open="folderDeleteOpen" title="Удалить папку?" description="Категории и карточки сохранятся. Категории из этой папки останутся без папки."><template #body><p>{{ deletingFolder?.name }}</p><UAlert v-if="error" color="error" :description="error"/></template><template #footer><UButton color="neutral" variant="outline" label="Отмена" @click="folderDeleteOpen=false"/><UButton color="error" label="Удалить папку" :loading="busy" @click="removeFolder"/></template></UModal>
    <UModal v-model:open="deleteOpen" :title="deletingCategory ? 'Удалить категорию?' : 'Удалить карточку?'" :description="deletingCategory ? 'Карточки сохранятся и перейдут в «Без категории».' : 'Карточка будет удалена из всех связанных хранилищ. Восстановить её будет невозможно.'"><template #body><p class="text-sm text-slate-500">{{ deleting && ('title' in deleting ? deleting.title : deleting.name) }}</p><UAlert v-if="error" color="error" :description="error" /></template><template #footer><UButton color="neutral" variant="outline" label="Отмена" @click="deleteOpen = false" /><UButton color="error" label="Удалить" :loading="busy" @click="remove" /></template></UModal>
  </div>
</template>
