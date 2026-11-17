<script setup lang="ts">
defineProps<{ brand: 'light' | 'magnat' }>()
</script>

<template>
  <span class="brand-icon-art">
    <img :src="brand === 'light' ? '/light-favicon.svg' : '/favicon.svg'" alt="" width="38" height="38" />
    <span v-if="brand === 'magnat'" class="brand-hover-sweep" aria-hidden="true">
      <img src="/magnat-logo-hover.svg" alt="" width="38" height="38" />
    </span>
  </span>
</template>

<style scoped>
.brand-icon-art{position:relative;flex-shrink:0}
.brand-icon-art img{display:block;width:100%;height:100%;object-fit:contain}
</style>
