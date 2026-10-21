<script setup lang="ts">
/** One section of the home page: a heading and its text on the left, a sample on the right (stacked on phones). */
import PixelIcon from '../components/PixelIcon.vue'

defineProps<{ id: string; eyebrow: string; title: string; icon?: string }>()
</script>

<template>
  <section :id="id" class="scroll-mt-8 border-t border-night-800/80 py-12 sm:py-16" :aria-labelledby="`${id}-title`">
    <div class="grid items-start gap-8 lg:grid-cols-5 lg:gap-12">
      <div class="lg:col-span-2">
        <p class="eyebrow mb-3 flex items-center gap-2"><PixelIcon v-if="icon" :name="icon" :size="16" coloured />{{ eyebrow }}</p>
        <h2 :id="`${id}-title`" class="text-2xl leading-tight font-bold tracking-tight text-night-100 sm:text-3xl">{{ title }}</h2>
        <div class="mt-4 space-y-3 text-night-300"><slot /></div>
      </div>
      <div class="min-w-0 lg:col-span-3"><slot name="sample" /></div>
    </div>
  </section>
</template>
