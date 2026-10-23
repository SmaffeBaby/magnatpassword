<script setup lang="ts">
import { useBrandLogo } from '../composables/useBrandLogo'

const props = withDefaults(defineProps<{ to?: string; compact?: boolean; admin?: boolean }>(), { to: '/' })
const { brand, label } = useBrandLogo(props)
</script>

<template>
  <NuxtLink :to="to" :class="['brand', { 'brand-compact': compact, 'brand-admin': admin, 'brand-is-light': brand === 'light' }]" :aria-label="label">
    <template v-if="brand === 'light'">
      <img v-if="compact" src="/light-favicon.svg" alt="" class="brand-logo" width="38" height="38" />
      <span v-else class="light-wordmark"><img src="/light-logo.svg" alt="" width="139" height="30" /></span>
      <span v-if="!compact && admin" class="brand-light">/ admin</span>
    </template>
    <template v-else>
      <img src="/favicon.svg" alt="" class="brand-logo" width="38" height="38" />
      <span v-if="!compact">{{ admin ? 'Magnat' : 'magnat' }}<span class="brand-light">{{ admin ? ' / admin' : 'password' }}</span></span>
    </template>
  </NuxtLink>
</template>
