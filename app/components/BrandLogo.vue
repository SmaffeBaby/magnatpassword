<script setup lang="ts">
import { useBrandLogo } from '../composables/useBrandLogo'
import BrandWordmark from './BrandWordmark.vue'
import BrandIcon from './BrandIcon.vue'

const props = withDefaults(defineProps<{ to?: string; compact?: boolean; admin?: boolean }>(), { to: '/' })
const { brand, label, application } = useBrandLogo(props)
</script>

<template>
  <NuxtLink :to="to" :class="['brand', application ? `brand-product-${application.slug}` : '', { 'brand-compact': compact, 'brand-admin': admin, 'brand-is-light': brand === 'light' }]" :aria-label="label">
    <template v-if="brand === 'light'">
      <BrandIcon v-if="compact" brand="light" class="brand-logo" />
      <span v-else class="light-wordmark"><BrandWordmark brand="light" /></span>
      <span v-if="!compact && admin" class="brand-light">/ admin</span>
    </template>
    <template v-else>
      <BrandIcon brand="magnat" class="brand-logo" />
      <span v-if="!compact" class="brand-wordmark"><BrandWordmark brand="magnat" :text="admin ? 'Magnat' : 'magnat'" /><span class="brand-light">{{ admin ? ' / admin' : application?.slug || '' }}</span></span>
    </template>
  </NuxtLink>
</template>

<style scoped>
.brand-wordmark{display:inline-flex;align-items:baseline;gap:.15em}
</style>
