<script setup lang="ts">
defineProps<{groups:{label:string;value:string}[];currencyOptions:{label:string;value:string}[];statusOptions:{label:string;value:string}[]}>()
const group=defineModel<string>('group',{required:true}),currency=defineModel<string>('currency',{required:true}),search=defineModel<string>('search',{required:true}),status=defineModel<string>('status',{required:true})
</script>
<template><div class="subscription-filters"><UInput v-model="search" icon="i-lucide-search" placeholder="Сервис или подписка" aria-label="Поиск подписок" /><USelect v-model="group" :items="groups" aria-label="Хранилище подписок" /><USelect v-model="currency" :items="currencyOptions" aria-label="Валюта подписок" /><USelect v-model="status" :items="statusOptions" aria-label="Срок подписки" /></div></template>
