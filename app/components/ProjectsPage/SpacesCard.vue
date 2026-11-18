<script setup lang="ts">defineProps<{hero?:boolean}>()</script>
<template><NuxtLink to="/spaces" class="password-glass" :class="{'password-launch-card':hero}" aria-label="Открыть Пространства"><span class="projects-app-icon" :class="{'projects-launch-icon':hero}"><UIcon name="i-lucide-orbit"/></span><span>Пространства</span></NuxtLink></template>
