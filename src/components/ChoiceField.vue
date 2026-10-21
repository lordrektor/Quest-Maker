<script setup lang="ts">
/**
 * A choice among options. Up to five options it is a plain dropdown (or, with `custom`, a text field with
 * suggestions); with more it opens a searchable picker: type to narrow, arrows to move, Enter to pick, Esc to close.
 * With `custom`, what is typed can be used as it is (an item key, a quest id...).
 */
import { computed, nextTick, ref, watch } from 'vue'

export interface Choice {
  value: string
  label?: string
  hint?: string
}

const props = withDefaults(defineProps<{
  /** The input's id (for its label). */
  id: string
  modelValue: string
  options: (Choice | string)[]
  /** Offered first as the empty choice (value ''), e.g. "default (killer)"; null offers none. */
  emptyLabel?: string | null
  /** What is typed can be used as it is. */
  custom?: boolean
  placeholder?: string
  /** Shown above the list in the picker. */
  title?: string
  inputClass?: string
  /** Empty again after each pick (a field that adds values to a list). */
  resetAfter?: boolean
}>(), { emptyLabel: null, custom: false, placeholder: '', title: '', inputClass: '', resetAfter: false })

const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string] }>()

const LIMIT = 5
const SHOWN = 300
const choices = computed<Choice[]>(() => props.options.map((o) => (typeof o === 'string' ? { value: o } : o)))
const count = computed(() => choices.value.length + (props.emptyLabel !== null ? 1 : 0))
const big = computed(() => count.value > LIMIT)
/** The same value may sit in several places (a conversation id under two NPCs): its hint tells them apart. */
const choiceKey = (c: Choice) => (c.hint === undefined ? c.value : `${c.value}\u0000${c.hint}`)
const labelOf = (value: string) => (value === '' ? props.emptyLabel ?? '' : choices.value.find((c) => c.value === value)?.label ?? value)

function pick(value: string) {
  emit('update:modelValue', value)
  emit('change', value)
  if (props.resetAfter) typed.value = ''
}

/** A dropdown shows what the parent keeps: a refused pick (a switch cancelled) goes back. */
function pickFromSelect(event: Event) {
  const select = event.target as HTMLSelectElement
  pick(select.value)
  void nextTick(() => (select.value = props.modelValue))
}

// Small: a dropdown, or a text field with suggestions
const typed = ref(props.modelValue)
watch(() => props.modelValue, (v) => (typed.value = v))

// Big: the picker
const dialog = ref<HTMLDialogElement | null>(null)
const search = ref<HTMLInputElement | null>(null)
const query = ref('')
const active = ref(0)
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all: Choice[] = [...(props.emptyLabel !== null ? [{ value: '', label: props.emptyLabel }] : []), ...choices.value]
  const matches = q === '' ? all : all.filter((c) => c.value.toLowerCase().includes(q) || (c.label ?? '').toLowerCase().includes(q)
    || (c.hint ?? '').toLowerCase().includes(q))
  return matches
})
const shown = computed(() => filtered.value.slice(0, SHOWN))
const useTyped = computed(() => props.custom && query.value.trim() !== '' && !filtered.value.some((c) => c.value === query.value.trim()))

async function open() {
  query.value = ''
  active.value = Math.max(0, filtered.value.findIndex((c) => c.value === props.modelValue))
  dialog.value?.showModal()
  await nextTick()
  search.value?.focus()
  scrollActive()
}

function close() {
  dialog.value?.close()
}

function choose(value: string) {
  pick(value)
  close()
}

function scrollActive() {
  void nextTick(() => dialog.value?.querySelector(`[data-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' }))
}

function onKey(event: KeyboardEvent) {
  const total = shown.value.length + (useTyped.value ? 1 : 0)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = Math.min(total - 1, active.value + 1)
    scrollActive()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = Math.max(0, active.value - 1)
    scrollActive()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    if (useTyped.value && active.value === 0) choose(query.value.trim())
    else {
      const c = shown.value[active.value - (useTyped.value ? 1 : 0)]
      if (c) choose(c.value)
      else if (props.custom && query.value.trim() !== '') choose(query.value.trim())
    }
  }
}

watch(query, () => (active.value = 0))

const FIELD = 'w-full rounded-md border border-night-700 bg-night-900 px-2 py-1.5 text-sm focus:border-gold-400 focus:outline-none'
</script>

<template>
  <!-- Up to five: a plain dropdown -->
  <select v-if="!big && !custom" :id="id" :class="[FIELD, inputClass]" :value="modelValue"
          @change="pickFromSelect($event)">
    <option v-if="emptyLabel !== null" value="">{{ emptyLabel }}</option>
    <option v-for="c in choices" :key="choiceKey(c)" :value="c.value">{{ c.label ?? c.value }}</option>
  </select>

  <!-- Up to five, free text: a text field with suggestions -->
  <template v-else-if="!big">
    <input :id="id" v-model="typed" :class="[FIELD, inputClass]" :list="choices.length ? `${id}-list` : undefined" :placeholder="placeholder"
           autocomplete="off" spellcheck="false" @change="pick(typed.trim())" />
    <datalist v-if="choices.length" :id="`${id}-list`">
      <option v-for="c in choices" :key="choiceKey(c)" :value="c.value">{{ [c.label, c.hint].filter(Boolean).join(' · ') }}</option>
    </datalist>
  </template>

  <!-- More: the picker -->
  <template v-else>
    <button :id="id" type="button" aria-haspopup="dialog" :class="[FIELD, inputClass, 'flex items-center justify-between gap-2 text-left']" @click="open">
      <span class="min-w-0 truncate" :class="modelValue === '' ? 'text-night-400' : ''">{{ modelValue === '' ? (emptyLabel ?? (placeholder || 'choose…')) : labelOf(modelValue) }}</span>
      <span class="shrink-0 text-night-400" aria-hidden="true">▾</span>
    </button>
    <dialog ref="dialog" :aria-label="title || 'Choose'"
            class="m-auto w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-night-700 bg-night-900 p-0 text-night-100 backdrop:bg-night-950/70"
            @click.self="close">
      <div class="flex max-h-[min(36rem,80dvh)] flex-col">
        <div class="flex items-center gap-2 border-b border-night-800 p-3">
          <input ref="search" v-model="query" type="search" :placeholder="custom ? 'Search, or type a value…' : 'Search…'" autocomplete="off" spellcheck="false"
                 role="combobox" aria-expanded="true" :aria-controls="`${id}-options`" :aria-activedescendant="`${id}-option-${active}`"
                 class="min-w-0 flex-1 rounded-md border border-night-700 bg-night-950 px-3 py-2 text-sm focus:border-gold-400 focus:outline-none"
                 @keydown="onKey" />
          <button type="button" class="rounded-md px-2 py-1 text-night-300 hover:bg-night-800 hover:text-night-100" aria-label="Close" @click="close">✕</button>
        </div>
        <p v-if="title" class="px-4 pt-2 text-xs text-night-400">{{ title }}</p>
        <ul :id="`${id}-options`" role="listbox" class="min-h-0 flex-1 overflow-y-auto p-2">
          <li v-if="useTyped" :id="`${id}-option-0`" role="option" :aria-selected="active === 0" data-index="0"
              class="cursor-pointer rounded-md px-3 py-2 text-sm" :class="active === 0 ? 'bg-night-800 text-gold-200' : 'text-night-200'"
              @mousemove="active = 0" @click="choose(query.trim())">
            Use “<span class="font-mono">{{ query.trim() }}</span>”
          </li>
          <li v-for="(c, i) in shown" :id="`${id}-option-${i + (useTyped ? 1 : 0)}`" :key="choiceKey(c)" role="option"
              :aria-selected="c.value === modelValue" :data-index="i + (useTyped ? 1 : 0)"
              class="flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-3 py-2 text-sm"
              :class="active === i + (useTyped ? 1 : 0) ? 'bg-night-800' : ''"
              @mousemove="active = i + (useTyped ? 1 : 0)" @click="choose(c.value)">
            <span class="min-w-0 truncate" :class="[c.value === '' ? 'text-night-400' : 'font-mono', c.value === modelValue ? 'text-gold-300' : '']">
              {{ c.label ?? c.value }}
            </span>
            <span v-if="c.hint" class="shrink-0 truncate text-xs text-night-400">{{ c.hint }}</span>
          </li>
          <li v-if="filtered.length > SHOWN" class="px-3 py-2 text-xs text-night-400">{{ filtered.length - SHOWN }} more: type to narrow.</li>
          <li v-if="filtered.length === 0 && !useTyped" class="px-3 py-4 text-sm text-night-400">Nothing matches.</li>
        </ul>
      </div>
    </dialog>
  </template>
</template>
