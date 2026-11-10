<script setup lang="ts">
import {appPlatformLabels} from '~~/shared/utils/app-version'
definePageMeta({layout:'home'})
const version=useAppVersionStore()
onMounted(()=>{void version.check()})
const published=computed(()=>version.release?.publishedAt?new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeZone:'Europe/Moscow'}).format(new Date(version.release.publishedAt)):'')
</script>
<template>
 <div class="app-version-page">
  <div class="team-page-heading"><div><h1>Версия приложения</h1><p>Установленная версия и доступные обновления.</p></div></div>
  <UCard class="mt-6"><template v-if="version.native"><div class="version-heading"><UIcon name="i-lucide-monitor-smartphone" class="size-9 text-slate-500"/><div><h2>Magnat</h2><p>{{appPlatformLabels[version.platform]}}</p></div></div><dl class="version-info"><div><dt>Установлена</dt><dd>{{version.installed?'v'+version.installed:'Не удалось определить'}}</dd></div><div><dt>Последняя опубликованная</dt><dd>{{version.loading?'Проверяем…':version.release?'v'+version.release.version:'Нет данных'}}</dd></div><div v-if="published"><dt>Дата выпуска</dt><dd>{{published}}</dd></div></dl>
   <UAlert v-if="version.error" color="neutral" :description="version.error"/>
   <UAlert v-else-if="!version.installed&&!version.loading" color="neutral" description="Эта сборка не передаёт свою версию. Установите свежую сборку приложения со страницы загрузки, чтобы включить точную проверку обновлений."/>
   <UAlert v-else-if="version.available" color="info" :description="`Доступна новая версия Magnat v${version.release?.version}.`"/>
   <UAlert v-else-if="version.current" color="success" description="У вас установлена актуальная версия приложения."/>
   <UAlert v-else-if="version.outdated" color="neutral" description="Новый релиз опубликован, установщик для вашей платформы пока недоступен."/>
   <div class="version-actions"><UButton v-if="version.available||!version.installed||version.outdated" label="Перейти и скачать" icon="i-lucide-download" @click="version.downloads()"/><UButton label="Проверить обновления" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="version.loading" @click="version.check()"/></div>
  </template><template v-else><p class="text-sm text-slate-500">Версия установленного приложения доступна внутри приложения Magnat.</p><UButton to="/downloads" label="Скачать приложение" icon="i-lucide-download" class="mt-4"/></template></UCard>
  <UCard v-if="version.release?.notes" class="mt-6"><h2 class="font-semibold">Что нового в v{{version.release.version}}</h2><p class="mt-4 whitespace-pre-wrap break-words leading-7 text-sm text-slate-600">{{version.release.notes}}</p></UCard>
 </div>
</template>
<style scoped>
.app-version-page{width:100%;max-width:800px;margin-inline:auto;min-width:0}.version-heading{display:flex;gap:16px;align-items:center}.version-heading h2{font-size:20px;font-weight:650;color:#475569}.version-heading p{font-size:12px;color:#94a3b8;margin-top:5px}.version-info{display:grid;gap:14px;margin:26px 0}.version-info>div{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;font-size:13px}.version-info dt{color:#64748b}.version-info dd{font-weight:600;color:#334155}.version-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
</style>
