<script setup lang="ts">
/** The Must / Must not switch of a requirement or a group: Must not (reversed, not: true) needs the player NOT to meet it. */
defineProps<{ not: boolean; label?: string }>()
const emit = defineEmits<{ update: [not: boolean] }>()
</script>

<template>
  <div role="group" :aria-label="label ?? 'The player'" class="inline-flex shrink-0 overflow-hidden rounded-md border border-night-600 text-xs whitespace-nowrap">
    <button type="button" class="px-1.5 py-0.5" :class="!not ? 'bg-sky-500/25 text-sky-100' : 'text-night-400 hover:text-night-100'"
            :aria-pressed="!not" title="The player must meet it" @click="emit('update', false)">Must</button>
    <button type="button" class="border-l border-night-600 px-1.5 py-0.5" :class="not ? 'bg-red-500/25 text-red-100' : 'text-night-400 hover:text-night-100'"
            :aria-pressed="not" title="The player must NOT meet it" @click="emit('update', true)">Must not</button>
  </div>
</template>
