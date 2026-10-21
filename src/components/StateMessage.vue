<script setup lang="ts">
/** A centred message for empty, error and not-found states, with an optional retry button. */
defineProps<{ title: string; message?: string; eyebrow?: string; retry?: () => void }>()
</script>

<template>
  <div class="card mx-auto max-w-lg px-6 py-10 text-center" role="status">
    <p v-if="eyebrow" class="eyebrow mb-2">{{ eyebrow }}</p>
    <h2 class="text-xl font-semibold text-night-100">{{ title }}</h2>
    <p v-if="message" class="mt-2 text-night-300">{{ message }}</p>
    <div class="mt-6 flex flex-wrap justify-center gap-3">
      <button
        v-if="retry"
        type="button"
        class="rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-night-950 hover:bg-gold-300"
        @click="retry"
      >Try again</button>
      <slot />
    </div>
  </div>
</template>
