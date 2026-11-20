<script setup lang="ts">
import AssistantUpdates from '~/components/Assistant/Updates.vue'
import AdminOverview from '~/components/Admin/AdminOverview.vue'
import ReleaseSettings from '~/components/Admin/ReleaseSettings.vue'
import TeamSettings from '~/components/PasswordPage/Admin/TeamSettings.vue'
import AuthGate from '~/components/Auth/AuthGate.vue'
import BrandLogo from '~/components/Brand/BrandLogo.vue'
import { useAdminPage } from '~/composables/admin/useAdminPage'

const { setTeamVisibility, visibilityBusy, auth, vault, identity, checking, accessError, overview, section, titles, navigation, restore, switchAccount, switchingAccount, date } = useAdminPage()
</script>
<template>
  <AuthGate admin>
    <div v-if="checking" class="gate"><UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />Проверяем доступ…</div>
    <div v-else-if="!identity" class="gate"><UCard class="max-w-md"><h1 class="text-xl font-semibold">Панель управления</h1><p v-if="auth.user?.email" class="mt-4 break-all text-sm text-slate-500">Текущий аккаунт: {{ auth.user.email }}</p><p class="my-5 text-sm text-slate-500">{{ accessError }}</p><UAlert v-if="auth.error" color="error" :description="auth.error" class="mb-4"/><div class="flex flex-wrap gap-2"><UButton to="/password" color="neutral" variant="outline" label="В хранилище" /><UButton label="Повторить" @click="restore" /><UButton color="neutral" variant="outline" label="Войти под другим аккаунтом" :loading="switchingAccount" @click="switchAccount" /></div></UCard></div>
    <UDashboardGroup v-else>
      <UDashboardSidebar id="magnat-admin" collapsible class="bg-slate-50/70" :ui="{ footer: 'border-t border-default' }">
        <template #header="{ collapsed }"><BrandLogo to="/admin/password" :compact="collapsed" admin class="px-1 py-3" /></template>
        <template #default="{ collapsed }"><p v-if="!collapsed" class="mb-2 mt-4 px-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">Управление сайтом</p><UNavigationMenu :collapsed="collapsed" :items="navigation" orientation="vertical" tooltip /></template>
        <template #footer="{ collapsed }"><div class="w-full space-y-2 py-2"><p v-if="!collapsed" class="truncate px-2 text-xs text-slate-500">{{ identity.email }}</p><UButton :label="collapsed ? undefined : 'Выйти'" icon="i-lucide-log-out" aria-label="Выйти" color="neutral" variant="ghost" block @click="auth.logout()" /></div></template>
      </UDashboardSidebar>
      <UDashboardPanel :id="section">
        <template #header><UDashboardNavbar :title="titles[section]"><template #leading><UDashboardSidebarCollapse /></template><template #right><UButton to="/" icon="i-lucide-external-link" label="Открыть сайт" color="neutral" variant="outline" size="sm" /></template></UDashboardNavbar></template>
        <template #body>
          <AdminOverview v-if="section === 'overview'" :account-id="identity.id" :totals="overview" />
          <AssistantUpdates v-else-if="section === 'assistant'" admin />
          <ReleaseSettings v-else-if="section === 'releases'" />
          <TeamSettings v-else-if="section==='team'"/>
          <template v-else-if="section === 'users'"><UAlert v-if="accessError" color="error" :description="accessError" class="mb-4"/><UCard><template #header><div class="flex items-center justify-between"><h2 class="font-semibold">Аккаунты сервиса</h2><UButton color="neutral" variant="outline" label="Обновить" icon="i-lucide-refresh-cw" :loading="checking" @click="restore" /></div></template><div class="overflow-x-auto"><table class="admin-table"><thead><tr><th>Email</th><th>Дата регистрации</th><th>Последний вход</th><th>Видимость в команде</th></tr></thead><tbody><tr v-for="user in overview?.users" :key="user.id"><td>{{ user.email }}</td><td>{{ date(user.createdAt) }}</td><td>{{ date(user.lastSignIn) }}</td><td><div class="admin-visibility"><span :class="{'is-hidden':user.isHidden}">{{ user.isHidden?'Скрыт':'Отображается' }}</span><UButton size="xs" color="neutral" variant="outline" :icon="user.isHidden?'i-lucide-eye':'i-lucide-eye-off'" :label="user.isHidden?'Показать':'Скрыть'" :loading="visibilityBusy===user.id" :disabled="!!visibilityBusy" @click="setTeamVisibility(user)"/></div></td></tr></tbody></table></div><p class="mt-4 text-xs text-slate-400">Показаны первые 1000 аккаунтов. Скрытые аккаунты не отображаются в списке, структуре и поиске команды. Вход и доступы к хранилищам сохраняются.</p></UCard></template>
          <template v-else-if="section === 'security'"><UCard><template #header><h2 class="font-semibold">Защита хранилища</h2></template><dl class="security-list"><div><dt>Личное хранилище</dt><dd>AES-256-GCM на сервере</dd></div><div><dt>Общие хранилища</dt><dd>AES-256-GCM на сервере · доступ по участникам</dd></div><div><dt>Управление ключами</dt><dd>На сервере · шифрование AES-256-GCM</dd></div><div><dt>Изоляция пользователей</dt><dd>PostgreSQL Row Level Security</dd></div><div><dt>Автоблокировка</dt><dd>Время выхода настраивается в вашем профиле</dd></div><div><dt>Хранилище файлов</dt><dd>Приватный bucket vault-files, зарезервирован для вложений</dd></div></dl><UAlert class="mt-6" color="warning" variant="soft" title="Вход по паролю аккаунта" description="Мастер-пароль нужен только один раз для переноса прежних хранилищ. После переноса все устройства используют обычный вход в аккаунт." /><div class="mt-6 flex flex-wrap gap-3"><UButton :disabled="!vault.exists" label="Скачать зашифрованную копию" icon="i-lucide-download" @click="vault.exportEncrypted()" /><UButton color="neutral" variant="outline" :disabled="!vault.unlocked" label="Выйти из аккаунта" icon="i-lucide-lock-keyhole" @click="auth.logout()" /></div><p class="mt-3 text-xs text-slate-400">Резервная копия содержит зашифрованные данные. Для восстановления перенесённого хранилища нужен сохранённый серверный ключ шифрования. Открыть или создать хранилище можно в разделе «Пароли».</p><UAlert v-if="vault.error" class="mt-3" color="error" :description="vault.error" /></UCard></template>
        </template>
      </UDashboardPanel>
    </UDashboardGroup>
  </AuthGate>
</template>
