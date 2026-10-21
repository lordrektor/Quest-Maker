<script setup lang="ts">
/**
 * The types the server knows, to drag into a quest box (or click to add to the selected quest): objectives,
 * requirements and rewards. Filter by the plugin that adds them, or search. Stages and fail rules are added from each
 * quest box.
 */
import PixelIcon from '../../components/PixelIcon.vue'
import { computed, ref } from 'vue'
import type { Category, TypeDto } from '../../../shared/creator'
import ChoiceField from '../../components/ChoiceField.vue'
import TypeIcon from '../../components/TypeIcon.vue'
import { prettyType } from '../../describe'
import { ownerLabel } from '../catalog'
import { useEditor } from '../editor'
import { requirementTarget, useOf } from '../ops'
import { takesType } from '../../../shared/quest/uses'

const editor = useEditor()
type Tab = Category
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'objective', label: 'Objectives', icon: 'objective' },
  { id: 'requirement', label: 'Requirements', icon: 'requirement' },
  { id: 'reward', label: 'Rewards', icon: 'reward' },
]
const tab = ref<Tab>('objective')
const owner = ref('')
const search = ref('')

const catalog = computed(() => editor.catalog.value)
const types = computed<TypeDto[]>(() => {
  if (!catalog.value) return []
  const q = search.value.trim().toLowerCase()
  const types = catalog.value.response.catalog
  return catalog.value.list(tab.value).filter((t) => (!owner.value || t.owner === owner.value)
    && (!q || t.id.includes(q) || t.description.toLowerCase().includes(q))
    // Never a requirement its place cannot take (a container in fail.unless or for an auto_start quest)
    && (!use.value || takesType(types, use.value, t)))
})

/** The quest a click adds to: the selected one, or the only one. */
const target = computed(() => {
  const sel = editor.state.selection
  if (sel && 'quest' in sel && editor.state.ws.quests[sel.quest]) return sel.quest
  if (sel?.kind === 'link') return sel.holder
  return editor.state.ws.order.length === 1 ? editor.state.ws.order[0] : undefined
})

/** The use of the place a requirement clicked here goes to (fail.unless when the fail rules are selected...). */
const use = computed(() => {
  if (tab.value !== 'requirement' || !target.value) return null
  const model = editor.state.ws.quests[target.value]?.model
  if (!model) return null
  const sel = editor.state.selection
  return useOf(model, requirementTarget(model, sel?.kind === 'part' && sel.quest === target.value ? sel.key : null))
})

function drag(event: DragEvent, part: object) {
  event.dataTransfer?.setData('application/x-chronos-part', JSON.stringify(part))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function add(type: TypeDto) {
  if (!target.value) {
    editor.notify('Select a quest first (or drag the type into its box).', 'error')
    return
  }
  editor.addPart(target.value, tab.value, type.id)
}
</script>

<template>
  <section aria-label="Types" class="flex h-full min-h-0 flex-col">
    <div role="tablist" class="grid grid-cols-3 border-b border-night-800 text-xs">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        role="tab"
        :aria-selected="tab === t.id"
        class="flex flex-col items-center gap-1 px-1 py-2"
        :class="tab === t.id ? 'border-b-2 border-gold-400 text-gold-300' : 'text-night-300 hover:text-night-100'"
        @click="tab = t.id"
      ><PixelIcon :name="t.icon" :size="14" />{{ t.label }}</button>
    </div>

    <div class="flex flex-col gap-2 border-b border-night-800 p-2">
      <label class="sr-only" for="palette-search">Search types</label>
      <input id="palette-search" v-model="search" type="search" placeholder="Search…"
             class="w-full rounded-md border border-night-700 bg-night-900 px-2 py-1.5 text-sm" />
      <label class="sr-only" for="palette-owner">Plugin</label>
      <ChoiceField id="palette-owner" v-model="owner" empty-label="Every plugin" title="Types added by"
                   :options="(catalog?.owners ?? []).map((o) => ({ value: o, label: ownerLabel(o) }))" />
    </div>
    <ul class="min-h-0 flex-1 overflow-y-auto p-2" :aria-label="`${tab} types`">
      <li v-for="t in types" :key="t.id">
        <button
          type="button"
          draggable="true"
          class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-night-800 focus-visible:bg-night-800"
          :title="`${t.description}${catalog?.note(tab, t.id) ? ` (${catalog.note(tab, t.id)})` : ''} — drag into a quest, or click to add to ${target ?? 'the selected quest'}`"
          @dragstart="drag($event, { category: tab, type: t.id })"
          @click="add(t)"
        >
          <TypeIcon :category="tab" :type="t.id" size="sm" class="size-8!" :label="prettyType(t.id)" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm text-night-100">{{ prettyType(t.id) }}</span>
            <span class="block truncate text-xs text-night-400">{{ t.description }}</span>
          </span>
          <span v-if="t.owner !== 'Chronos'" class="mt-0.5 shrink-0 rounded bg-night-800 px-1 text-[10px] text-night-300">{{ t.owner }}</span>
        </button>
      </li>
      <li v-if="types.length === 0" class="px-2 py-4 text-sm text-night-400">
        {{ catalog?.ready ? 'No type matches.' : 'No types yet: run /chronos cl types in game.' }}
      </li>
    </ul>
  </section>
</template>
