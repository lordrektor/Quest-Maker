<script setup lang="ts">
/**
 * One argument, edited by its kind: text with suggestions, a number, true/false, a duration, a choice, a list of keys.
 * An empty field is unset (the type's default applies). Values are written in the types the plugin expects.
 */
import { computed, ref, watch } from 'vue'
import type { ParamDto } from '../../../shared/creator'
import type { Value } from '../../../shared/quest/canonical'
import { tryDuration } from '../../../shared/quest/durations'
import ChoiceField from '../../components/ChoiceField.vue'
import MiniText from '../../components/MiniText.vue'
import { COMPARE_WORDS, humanDuration } from '../../describe'
import type { Suggestion } from '../catalog'
import { useEditor } from '../editor'
import { isLineList, parseInput, splitValues } from '../input'

const props = defineProps<{
  param: ParamDto
  value: Value | undefined
  /** An id prefix for the inputs (unique on the page). */
  uid: string
  /** The entry's argument values by name: a scoped argument (an NPC's conversation) offers only what they narrow to. */
  siblings?: Record<string, Value | undefined>
}>()
const emit = defineEmits<{ update: [value: Value | undefined] }>()
const editor = useEditor()

const id = computed(() => `${props.uid}-${props.param.name}`)
const quests = computed(() => editor.state.ws.order)
const suggestions = computed<Suggestion[]>(() => editor.catalog.value?.suggestions(props.param, quests.value, props.siblings)
  ?? (props.param.choices ?? []).map((value) => ({ value })))
const listKinds = ['STRING_LIST', 'ITEM_LIST', 'BLOCK_LIST', 'ENTITY_LIST']
const isList = computed(() => listKinds.includes(props.param.kind))
const missing = computed(() => editor.catalog.value?.missingRefs(props.param) ?? [])
/** The plugins whose /chronos cl refs fills this field's choices. */
const refProviders = computed(() => editor.catalog.value?.refProviders(props.param) ?? [])

const text = ref('')
/** Why what was typed was not stored (the in-game editor's message). */
const error = ref<string | null>(null)
watch(() => props.value, (v) => {
  error.value = null
  if (isList.value) return
  text.value = v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v)
}, { immediate: true })

const items = computed<string[]>(() => (Array.isArray(props.value) ? props.value : props.value === undefined ? [] : [String(props.value)]))

function commit() {
  const raw = text.value.trim()
  if (raw === '') {
    error.value = null
    return emit('update', undefined)
  }
  const parsed = parseInput(props.param, raw)
  if ('error' in parsed) {
    error.value = parsed.error
    return
  }
  error.value = null
  emit('update', parsed.value)
  // Shown as stored (90m reads 1h30m), even when the value did not change
  text.value = String(parsed.value)
}

/** Adds what was picked or typed: commas add several, except in a list of text lines, where a line may also repeat. */
function addValue(raw: string) {
  const lines = isLineList(props.param)
  const values: string[] = []
  for (const part of splitValues(raw, lines)) {
    const parsed = parseInput(props.param, part)
    if ('error' in parsed) {
      error.value = `'${part}': ${parsed.error}`
      return
    }
    values.push(String(parsed.value))
  }
  if (values.length === 0) return
  error.value = null
  emit('update', [...items.value, ...(lines ? values : values.filter((v, i) => !items.value.includes(v) && values.indexOf(v) === i))])
}

/** Moves a value one place earlier (the in-game editor's shift-click). */
function moveEarlier(i: number) {
  if (i <= 0) return
  const next = [...items.value]
  ;[next[i - 1], next[i]] = [next[i]!, next[i - 1]!]
  emit('update', next)
}

/** A text value picked or typed. */
function setText(raw: string) {
  text.value = raw
  if (props.param.kind === 'QUEST') onQuestBlur()
  else commit()
}

function removeItem(i: number) {
  const next = items.value.filter((_, j) => j !== i)
  emit('update', next.length > 0 ? next : undefined)
}

const durationHint = computed(() => {
  if (props.param.kind !== 'DURATION' || text.value.trim() === '') return null
  return tryDuration(text.value.trim()) === null ? 'not a duration (30s, 90m, 1d12h, 2w)' : humanDuration(text.value.trim())
})

function onQuestBlur() {
  commit()
  if (props.param.kind === 'QUEST' && text.value.trim() !== '') void editor.checkQuest(text.value.trim())
}

const questState = computed(() => {
  if (props.param.kind !== 'QUEST' || text.value.trim() === '') return null
  const q = text.value.trim()
  if (editor.state.ws.quests[q]) return 'on this workspace'
  const known = editor.state.known[q]
  return known === true ? 'in the database' : known === false ? 'does not exist (yet)' : null
})
/** A compare argument reads in words: its choices ("at least", "less than"), its default and its name. */
const plainCompare = computed(() => props.param.name === 'compare' && props.param.kind === 'CHOICE')
const shown = (value: string) => (plainCompare.value ? COMPARE_WORDS[value] ?? value : value)
const choiceOptions = computed(() => (props.param.choices ?? []).map((value) => ({ value, label: shown(value) })))
const fieldName = computed(() => (plainCompare.value ? 'how it compares' : props.param.name))
const defaultText = computed(() => (props.param.default === null ? '' : `default ${shown(props.param.default)}`))
const FIELD = 'w-full rounded-md border border-night-700 bg-night-900 px-2 py-1.5 text-sm focus:border-gold-400 focus:outline-none'
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="id" class="flex items-baseline justify-between gap-2 text-xs">
      <span class="text-night-200" :class="plainCompare ? '' : 'font-mono'" :title="plainCompare ? param.name : undefined">{{ fieldName }}<span
            v-if="param.required" class="text-red-300" title="required"> *</span></span>
      <span class="truncate text-night-400">{{ defaultText }}</span>
    </label>

    <select v-if="param.kind === 'BOOLEAN'" :id="id" :class="FIELD" :value="value === undefined ? '' : String(value)"
            @change="emit('update', ($event.target as HTMLSelectElement).value === '' ? undefined : ($event.target as HTMLSelectElement).value === 'true')">
      <option value="">{{ param.default === null ? 'unset' : `default (${param.default})` }}</option>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>

    <ChoiceField v-else-if="param.kind === 'CHOICE'" :id="id" :model-value="value === undefined ? '' : String(value)" :options="choiceOptions"
                 :empty-label="param.default === null ? 'unset' : `default (${shown(param.default)})`" :title="param.description"
                 @change="(v) => emit('update', v === '' ? undefined : v)" />

    <template v-else-if="param.kind === 'TEXT'">
      <textarea :id="id" v-model="text" rows="2" :class="FIELD" @change="commit" />
      <div v-if="text" class="rounded-md bg-night-950 px-2 py-1 text-xs"><MiniText :text="text" /></div>
    </template>

    <template v-else-if="isList">
      <ul v-if="items.length > 0" class="flex flex-wrap gap-1" :aria-label="`${param.name} values`">
        <li v-for="(item, i) in items" :key="`${item}-${i}`"
            class="inline-flex items-center gap-1 rounded-full border border-night-600 bg-night-800 py-0.5 pr-1 pl-2 font-mono text-xs">
          {{ item }}
          <button v-if="i > 0" type="button" class="rounded-full px-1 text-night-400 hover:text-night-100" :aria-label="`Move ${item} earlier`"
                  title="Move earlier" @click="moveEarlier(i)">‹</button>
          <button type="button" class="rounded-full px-1 text-night-400 hover:text-red-300" :aria-label="`Remove ${item}`" @click="removeItem(i)">×</button>
        </li>
      </ul>
      <ChoiceField :id="id" model-value="" :options="suggestions.filter((s) => !items.includes(s.value))" custom reset-after
                   :placeholder="isLineList(param) ? 'add a line (MiniMessage)…' : 'add a value…'" :title="`Add to ${param.name}: ${param.description}`" @change="addValue" />
    </template>

    <ChoiceField v-else-if="suggestions.length && (param.kind === 'STRING' || param.kind === 'ITEM' || param.kind === 'BLOCK' || param.kind === 'QUEST')" :id="id"
                 :model-value="text" :options="suggestions" custom :empty-label="value === undefined ? null : 'unset'"
                 :placeholder="param.default === null ? '' : `default ${param.default}`" :title="param.description" @change="setText" />

    <input v-else :id="id" v-model="text" :class="FIELD"
           :inputmode="param.kind === 'INTEGER' ? 'numeric' : param.kind === 'DECIMAL' ? 'decimal' : undefined"
           :placeholder="param.kind === 'DURATION' ? '30s, 90m, 1d12h' : ''"
           @change="param.kind === 'QUEST' ? onQuestBlur() : commit()" />

    <p class="text-[11px] text-night-400">
      {{ param.description }}<template v-if="param.min !== null"> (at least {{ param.min }})</template>
      <span v-if="durationHint" class="text-night-300"> · {{ durationHint }}</span>
      <span v-if="questState" class="text-night-300"> · {{ questState }}</span>
      <span v-if="missing.length" class="text-gold-300"> · run /chronos cl refs {{ missing.join(', ') }} to list them</span>
    </p>
    <p v-if="refProviders.length && !missing.length" class="text-[11px] text-night-400">
      Can't see the value you're looking for? Run
      <template v-for="(provider, i) in refProviders" :key="provider"><template v-if="i > 0"> or </template><code
        class="text-night-200">/chronos cl refs {{ provider }}</code></template>
      to update the references.
    </p>
    <p v-if="error" class="text-[11px] text-red-300" role="alert">{{ error }}</p>
  </div>
</template>
