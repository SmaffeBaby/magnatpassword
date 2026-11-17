<script setup lang="ts">
const hub=useChatHubStore()
</script>
<template><button class="notification-bell chat-launcher" :aria-label="`Чаты: ${hub.unread} непрочитанных сообщений`" :aria-expanded="hub.opened" @click="hub.open()"><UIcon name="i-lucide-messages-square"/><span v-if="hub.unread" class="notification-count">{{hub.unread>99?'99+':hub.unread}}</span></button></template>
<style scoped>.chat-launcher{position:relative;display:inline-flex;align-items:center;justify-content:center}</style>
