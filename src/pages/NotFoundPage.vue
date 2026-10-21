<script setup lang="ts">
import StateMessage from '../components/StateMessage.vue'
import { usePageTitle } from '../title'

usePageTitle(() => 'Page not found')
</script>

<template>
  <StateMessage eyebrow="404" title="This page wandered off" message="Nothing lives at this address. Quests open in the creator, by workspace name.">
    <RouterLink to="/" class="rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-night-950 hover:bg-gold-300">Back to the showcase</RouterLink>
  </StateMessage>
</template>
