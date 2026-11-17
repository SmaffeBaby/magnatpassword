<script setup lang="ts">
defineProps<{ brand: 'light' | 'magnat'; text?: string }>()
</script>

<template>
  <span class="brand-wordmark-art" :class="`brand-wordmark-art-${brand}`">
    <img v-if="brand === 'light'" src="/light-logo.svg" alt="" width="139" height="30" />
    <span v-else>{{ text || 'magnat' }}</span>
    <span class="brand-hover-sweep" aria-hidden="true">
      <span v-if="brand === 'light'" class="brand-wordmark-ink" />
      <span v-else>{{ text || 'magnat' }}</span>
    </span>
  </span>
</template>

<style scoped>
.brand-wordmark-art{position:relative;display:inline-grid;vertical-align:baseline}
.brand-wordmark-art-light{--brand-hover-color:#1ed69a}
.brand-wordmark-art-magnat{--brand-hover-color:#000;color:#ad131e}
.brand-wordmark-ink{display:block;width:100%;height:100%;background:var(--brand-hover-color);mask:url('/light-logo-mask.svg') center/100% 100% no-repeat}
</style>
