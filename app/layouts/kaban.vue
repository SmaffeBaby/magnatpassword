<script setup lang="ts">
import AuthGate from '~/components/Auth/AuthGate.vue'
import KabanWorkspace from '~/components/Kaban/KabanWorkspace.vue'
</script>
<template><AuthGate><KabanWorkspace/><slot/></AuthGate></template>
