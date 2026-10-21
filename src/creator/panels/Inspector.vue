<script setup lang="ts">
/** The settings of what is selected: a quest, a stage, the finish, the fail rules, an entry, or a line between quests. */
import { computed, ref } from 'vue'
import { auth } from '../../auth'
import type { ParamDto } from '../../../shared/creator'
import type { Value } from '../../../shared/quest/canonical'
import { formatDuration, tryDuration } from '../../../shared/quest/durations'
import Chip from '../../components/Chip.vue'
import ItemIcon from '../../components/ItemIcon.vue'
import TypeIcon from '../../components/TypeIcon.vue'
import MiniText from '../../components/MiniText.vue'
import { describeAction, describeObjective, describeRequirement, groupLabel, prettyType } from '../../describe'
import { OBJECTIVE_FIELDS, ownerLabel } from '../catalog'
import { useEditor } from '../editor'
import { argOf, entryTree, type EntryModel, groupMode, isGroupEntry, type Nid, type Parent, type QuestModel, requirementTree, setArg, stageNumbers } from '../model'
import { clearRewardRequirements, dissolveGroup, groupLevel, moveStageAfter, requirementRoot, takesParty, takesRequirements, objectiveIdRefusal, parentOf, refusal, resetNotice, retype, unchainStage, useOf } from '../ops'
import { takesParam, takesType } from '../../../shared/quest/uses'
import { plainText } from '../../minimessage'
import NotSwitch from './NotSwitch.vue'
import RequirementList from './RequirementList.vue'
import { linkedIds, links } from '../workspace'
import ChoiceField from '../../components/ChoiceField.vue'
import ParamField from './ParamField.vue'
import EntryList from './EntryList.vue'
import { CALLBACK_EVENTS, GROUP_MODES, MAX_GROUP_LEVEL } from '../../../shared/quest/canonical'
import { typedId } from '../input'

const editor = useEditor()
const sel = computed(() => editor.state.selection)
const quest = computed(() => (sel.value && 'quest' in sel.value ? sel.value.quest : sel.value?.kind === 'link' ? sel.value.holder : null))
const state = computed(() => (quest.value ? editor.state.ws.quests[quest.value] : undefined))
const model = computed(() => state.value?.model)
const key = computed(() => (sel.value?.kind === 'part' ? sel.value.key : sel.value?.kind === 'box' ? 'start' : null))
const entry = computed(() => (key.value && model.value ? model.value.entries[key.value] : undefined))
const stage = computed(() => (key.value && model.value ? model.value.stages[key.value] : undefined))
const catalog = computed(() => editor.catalog.value)
const spec = computed(() => (entry.value ? catalog.value?.type(entry.value.category, entry.value.type) : undefined))
/** The entry's arguments by name, for the ones another narrows (an NPC's conversations). */
const entryArgs = computed(() => (entry.value ? Object.fromEntries(entry.value.args) : {}))
const problems = computed(() => (quest.value && key.value ? editor.checked.value.byPart.get(quest.value)?.get(key.value) ?? [] : []))
const line = computed(() => (sel.value?.kind === 'link' ? editor.lineOf(sel.value.holder, sel.value.nid) : undefined))

// Deleting a quest from the database: the id must be typed to confirm
const deleteDialog = ref<HTMLDialogElement | null>(null)
const deleting = ref<string | null>(null)
const typed = ref('')
const busy = ref(false)
/** Quests on this canvas whose lines lead to or from the one being deleted (they name it). */
const namedBy = computed(() => {
  const id = deleting.value
  if (!id) return []
  return [...new Set(links(editor.state.ws).filter((l) => l.holder !== id && (l.from === id || l.to === id)).map((l) => l.holder))].sort()
})

function askDelete(id: string) {
  deleting.value = id
  typed.value = ''
  deleteDialog.value?.showModal()
}

async function confirmDelete() {
  const id = deleting.value
  if (!id || typed.value.trim() !== id || busy.value) return
  busy.value = true
  try {
    if (await editor.deleteQuest(id)) deleteDialog.value?.close()
  } finally {
    busy.value = false
  }
}

/** Edits the selected quest's model. */
function onModel(change: (m: QuestModel) => string | null | void) {
  const id = quest.value
  if (!id) return
  editor.edit((ws) => change(ws.quests[id]!.model))
}

function onEntry(change: (e: EntryModel, m: QuestModel) => string | null | void) {
  const nid = key.value
  if (!nid) return
  onModel((m) => (m.entries[nid] ? change(m.entries[nid]!, m) : 'it is gone'))
}

// =========================================================================
// QUEST SETTINGS
// =========================================================================

const FALLBACK_FIELDS: ParamDto[] = [
  { name: 'name', kind: 'TEXT', required: true, default: null, min: null, description: 'Shown in menus and messages' },
  { name: 'icon', kind: 'ITEM', required: false, default: 'minecraft:paper', min: null, description: 'The menu icon', pick: ['vanilla:items'] },
  { name: 'pool', kind: 'STRING', required: true, default: null, min: null, description: 'The pool it belongs to', pick: ['d1:pools'] },
  { name: 'difficulty', kind: 'STRING', required: false, default: null, min: null, description: 'Timed pools roll quests by difficulty' },
  { name: 'description', kind: 'STRING_LIST', required: false, default: null, min: null, description: 'Lines under the name in menus (MiniMessage)' },
  { name: 'repeatable', kind: 'BOOLEAN', required: false, default: 'false', min: null, description: 'Can be started again after it is completed' },
  { name: 'cooldown', kind: 'DURATION', required: false, default: null, min: null, description: 'Wait after completing (repeatable quests)' },
  { name: 'time_limit', kind: 'DURATION', required: false, default: null, min: null, description: 'Time to finish once started' },
  { name: 'auto_start', kind: 'BOOLEAN', required: false, default: 'false', min: null, description: 'Starts by itself once its requirements are met' },
  { name: 'no_teleport', kind: 'BOOLEAN', required: false, default: 'false', min: null, description: 'No Metabasis teleports (/warp, /spawn, /tpa, /back) while it runs' },
  { name: 'hidden_until_unlocked', kind: 'BOOLEAN', required: false, default: 'false', min: null, description: 'Hidden in menus until its requirements are met' },
  {
    name: 'scope', kind: 'CHOICE', required: false, default: 'character', choices: ['character', 'account'], min: null,
    description: 'ExperienceTailor characters: character = each character has its own progress, completions and cooldown; account = the player\'s characters share them',
  },
]
/** The server's quest fields (/chronos cl types), with the fallback fields it does not send yet (an older Chronos). */
const fields = computed(() => {
  const server = catalog.value?.response.catalog.quest_fields?.fields
  const list = server ? [...server, ...FALLBACK_FIELDS.filter((f) => !server.some((s) => s.name === f.name))] : FALLBACK_FIELDS
  return list.filter((f) => f.name !== 'pool')
})
const failFields = computed(() => catalog.value?.response.catalog.quest_fields?.fail)

function setting(m: QuestModel, name: string): Value | undefined {
  const s = m.settings
  switch (name) {
    case 'name': return s.name
    case 'icon': return s.icon === 'minecraft:paper' ? undefined : s.icon
    case 'difficulty': return s.difficulty ?? undefined
    case 'description': return s.description.length > 0 ? s.description : undefined
    case 'repeatable': return s.repeatable ? true : undefined
    case 'cooldown': return s.cooldown ? formatDuration(s.cooldown) : undefined
    case 'time_limit': return s.timeLimit ? formatDuration(s.timeLimit) : undefined
    case 'auto_start': return s.autoStart ? true : undefined
    case 'no_teleport': return s.noTeleport ? true : undefined
    case 'hidden_until_unlocked': return s.hiddenUntilUnlocked ? true : undefined
    case 'scope': return s.scope === 'account' ? 'account' : undefined
  }
  return undefined
}

function setSetting(name: string, value: Value | undefined) {
  onModel((m) => {
    const s = m.settings
    const textOf = (v: Value | undefined) => (v === undefined ? '' : Array.isArray(v) ? v.join(' ') : String(v))
    switch (name) {
      case 'name': s.name = textOf(value); break
      case 'icon': s.icon = textOf(value) || 'minecraft:paper'; break
      case 'difficulty': s.difficulty = textOf(value) || null; break
      case 'description': s.description = Array.isArray(value) ? value : value === undefined ? [] : [String(value)]; break
      case 'repeatable': s.repeatable = value === true; break
      case 'auto_start': s.autoStart = value === true; break
      case 'no_teleport': s.noTeleport = value === true; break
      case 'hidden_until_unlocked': s.hiddenUntilUnlocked = value === true; break
      case 'scope': s.scope = value === 'account' ? 'account' : 'character'; break
      case 'cooldown':
      case 'time_limit': {
        const seconds = value === undefined ? 0 : tryDuration(String(value))
        if (seconds === null) return `'${String(value)}' is not a duration (30s, 90m, 1d12h, 2w)`
        if (name === 'cooldown') s.cooldown = seconds
        else s.timeLimit = seconds
        break
      }
    }
    return null
  })
}

const poolChoices = computed(() => {
  const pools = (catalog.value?.pools ?? []).map((p) => ({ value: p.id, hint: p.type === 'timed_random' ? 'rotating' : 'story' }))
  const current = model.value?.settings.pool
  if (current && !pools.some((p) => p.value === current)) pools.push({ value: current, hint: 'not in the database' })
  return pools
})

/** The quest's pool when it decides the quest's scope (a timed or account pool), like the in-game editor's lore line. */
const scopePool = computed(() => {
  const id = model.value?.settings.pool
  const pool = id ? catalog.value?.pools.find((p) => p.id === id) : undefined
  return pool && (pool.scope === 'account' || pool.type === 'timed_random') ? pool : null
})

function setPool(value: string) {
  onModel((m) => {
    m.settings.pool = value || null
  })
}

const messageKeys = computed(() => catalog.value?.response.catalog.quest_fields?.messages ?? ['start', 'complete', 'abandon', 'expire'])

function message(m: QuestModel, k: string): string | undefined {
  return m.messages.find(([key]) => key === k)?.[1]
}

function setMessage(k: string, value: Value | undefined) {
  onModel((m) => {
    const text = value === undefined ? '' : String(value)
    const i = m.messages.findIndex(([key]) => key === k)
    if (text === '' && i >= 0) m.messages.splice(i, 1)
    else if (i >= 0) m.messages[i] = [k, text]
    else if (text !== '') m.messages.push([k, text])
  })
}

const noticeParts = computed(() => catalog.value?.response.catalog.quest_fields?.notices.parts ?? {})

function notice(m: QuestModel, event: string, part: string, name: string): Value | undefined {
  const tree = m.notices.find(([e]) => e === event)?.[1]
  const holder = tree?.[part]
  if (holder === null || typeof holder !== 'object' || Array.isArray(holder)) return undefined
  const value = (holder as Record<string, unknown>)[name]
  return value === undefined || value === null ? undefined : (value as Value)
}

function setNotice(event: string, part: string, name: string, value: Value | undefined) {
  onModel((m) => {
    let i = m.notices.findIndex(([e]) => e === event)
    if (i < 0) {
      if (value === undefined) return
      m.notices.push([event, {}])
      i = m.notices.length - 1
    }
    const tree = m.notices[i]![1]
    const holder = (tree[part] !== null && typeof tree[part] === 'object' && !Array.isArray(tree[part]) ? tree[part] : {}) as Record<string, unknown>
    if (value === undefined) delete holder[name]
    else holder[name] = value
    if (Object.keys(holder).length > 0) tree[part] = holder
    else delete tree[part]
    if (Object.keys(tree).length === 0) m.notices.splice(i, 1)
  })
}

function noticeDefault(event: string, part: string, param: ParamDto): ParamDto {
  const base = catalog.value?.response.catalog.server?.notices?.[event]?.[part]
  const value = base && typeof base === 'object' ? (base as Record<string, unknown>)[param.name] : undefined
  return { ...param, default: value === undefined ? null : Array.isArray(value) ? value.join(', ') : String(value) }
}

// =========================================================================
// ENTRIES
// =========================================================================

function sentence(e: EntryModel) {
  const tree = entryTree(e)
  if (e.category === 'objective') return describeObjective(e.objectiveId ?? 'objective', tree)
  if (e.category === 'requirement') return describeRequirement(model.value ? requirementTree(model.value, e.nid) : tree)
  return describeAction(tree)
}

/** The selected reward may go to the party (the quest's, a stage's or an objective's rewards). */
const rewardTakesParty = computed(() => entry.value?.category === 'reward' && takesParty(where.value))
const PARTY_RANGE: ParamDto = { name: 'party range', kind: 'DECIMAL', required: false, default: '32', min: 0,
  description: 'Blocks around the player a party member must be in; 0 = anywhere online' }

/** The selected reward may have requirements (the quest's rewards, an objective's). */
const rewardTakesRequirements = computed(() => entry.value?.category === 'reward' && takesRequirements(where.value))
/** The requirement types a reward's requirements take (the reward use). */
const rewardRequirementTypes = computed(() => (catalog.value?.list('requirement') ?? [])
  .filter((t) => takesType(catalog.value?.response.catalog, 'reward', t))
  .map((t) => ({ value: t.id, label: prettyType(t.id), hint: ownerLabel(t.owner) })))

function addRewardRequirement(type: string) {
  if (type && quest.value && entry.value) editor.addRewardRequirement(quest.value, entry.value.nid, type)
}

/** The selected entry is a group of requirements. */
const group = computed(() => (entry.value && isGroupEntry(entry.value) ? entry.value : undefined))

const unknownArgs = computed(() => {
  if (!entry.value) return []
  const known = new Set([...(spec.value?.params.map((p) => p.name) ?? []), 'display'])
  return entry.value.args.filter(([k]) => !known.has(k))
})

/** The places an entry can move to. */
const places = computed(() => {
  const m = model.value
  const e = entry.value
  if (!m || !e) return []
  const options: { label: string; parent: Parent }[] = []
  if (e.category === 'objective') {
    const { numbers } = stageNumbers(m)
    m.chain.forEach((nid, i) => options.push({ label: `Stage ${numbers.get(nid) ?? `(new, ${i + 1}.)`}`, parent: { kind: 'stage', stage: nid } }))
    options.push({ label: 'Fail rules: fail when', parent: { kind: 'when' } })
  } else if (e.category === 'requirement') {
    // A reward's requirements stay with it: its list and its groups only
    const root = requirementRoot(m, e.nid)
    const ofReward = root?.kind === 'reward-requirements'
    if (ofReward) options.push({ label: 'Only if (its reward\'s requirements)', parent: root })
    else {
      options.push({ label: 'Requirements (to start)', parent: { kind: 'requirements' } })
      options.push({ label: 'Fail rules: fail unless', parent: { kind: 'unless' } })
    }
    // Into a group
    for (const g of Object.values(m.entries)) {
      if (!g.members || g.nid === e.nid) continue
      const outer = requirementRoot(m, g.nid)
      if ((outer?.kind === 'reward-requirements') !== ofReward || (ofReward && JSON.stringify(outer) !== JSON.stringify(root))) continue
      const list = outer?.kind === 'unless' ? 'fail unless' : outer?.kind === 'requirements' ? 'requirements' : ofReward ? 'only if' : 'not connected'
      const shown = plainText(describeRequirement(requirementTree(m, g.nid)).mini)
      options.push({ label: `In a group (${list}): ${shown.length > 60 ? `${shown.slice(0, 60)}…` : shown}`, parent: { kind: 'group', group: g.nid } })
    }
  } else {
    options.push({ label: 'Rewards (at the finish)', parent: { kind: 'rewards' } })
    const { numbers } = stageNumbers(m)
    m.chain.forEach((nid, i) => {
      options.push({ label: `Stage ${numbers.get(nid) ?? `(new, ${i + 1}.)`}: when it is done`, parent: { kind: 'stage-rewards', stage: nid } })
      for (const o of m.stages[nid]!.objectives) {
        options.push({ label: `Objective ${m.entries[o]?.objectiveId ?? o}: when it is done`, parent: { kind: 'objective-rewards', objective: o } })
      }
    })
    options.push({ label: 'Fail rules: then (when it fails)', parent: { kind: 'actions' } })
    // Callbacks: the same types, run on events and never listed
    for (const event of CALLBACK_EVENTS) options.push({ label: `Callback: on ${event}`, parent: { kind: 'callback', event } })
    m.chain.forEach((nid, i) => {
      options.push({ label: `Stage ${numbers.get(nid) ?? `(new, ${i + 1}.)`}: callback`, parent: { kind: 'stage-callbacks', stage: nid } })
      for (const o of m.stages[nid]!.objectives) {
        options.push({ label: `Objective ${m.entries[o]?.objectiveId ?? o}: callback`, parent: { kind: 'objective-callbacks', objective: o } })
      }
    })
  }
  // Not where its type, or a filled spot argument, cannot be read
  return options.filter((o) => refusal(m, e.nid, o.parent, catalog.value?.response.catalog) === null)
})
const where = computed(() => (model.value && entry.value ? parentOf(model.value, entry.value.nid) : null))
/** The use of the place a requirement sits in (requirements, auto_start, fail.unless), or null. */
const use = computed(() => (model.value && entry.value?.category === 'requirement' ? useOf(model.value, where.value) : null))
/** The entry's arguments to show: not one its place cannot read (a spot in fail.unless), unless it has a value to clear. */
const shownParams = computed(() => (spec.value?.params ?? []).filter((p) => !use.value || takesParam(catalog.value?.response.catalog, use.value, p)
  || (entry.value && argOf(entry.value, p.name) !== undefined)))
/** A reward type with a party argument of its own (Phantasos: the party watches too): its field, not the Party section. */
const ownParty = computed(() => entry.value?.category === 'reward' && (spec.value?.params.some((p) => p.name === 'party') ?? false))
const whereIndex = computed(() => places.value.findIndex((p) => JSON.stringify(p.parent) === JSON.stringify(where.value)))

function moveTo(raw: string) {
  const i = Number(raw)
  const nid = key.value
  if (!nid || !quest.value) return
  if (i < 0) editor.detachEntry(quest.value, nid)
  else editor.moveEntry(quest.value, nid, places.value[i]!.parent)
}

function setObjectiveId(event: Event) {
  const input = event.target as HTMLInputElement
  const value = typedId(input.value)
  input.value = value
  onEntry((e, m) => objectiveIdRefusal(m, e.nid, value) ?? void (e.objectiveId = value))
}

function setFilterWorlds(mode: string, values: string[] | undefined) {
  onEntry((e) => {
    const f = { ...(e.filters ?? { worldMode: null, worlds: [], hand: [], minY: null, maxY: null }) }
    f.worldMode = mode === '' ? null : (mode as 'whitelist' | 'blacklist')
    f.worlds = f.worldMode === null ? [] : values ?? f.worlds
    e.filters = f
  })
}

function setFilter(name: 'hand' | 'minY' | 'maxY', value: Value | undefined) {
  onEntry((e) => {
    const f = { ...(e.filters ?? { worldMode: null, worlds: [], hand: [], minY: null, maxY: null }) }
    if (name === 'hand') f.hand = Array.isArray(value) ? value : value === undefined ? [] : [String(value)]
    else {
      const n = value === undefined ? null : Number(value)
      if (n !== null && !Number.isInteger(n)) return 'a whole number'
      f[name] = n
    }
    e.filters = f
    return null
  })
}

// The filters as the in-game editor offers them (from /chronos cl types); these stand in until it has been run
const FALLBACK_FILTERS: Record<string, ParamDto> = {
  worlds: { name: 'worlds', kind: 'STRING_LIST', required: false, default: null, min: null, description: 'Worlds where it counts (or not, by mode)', pick: ['list:chronos:worlds'] },
  hand: { name: 'hand', kind: 'ITEM_LIST', required: false, default: null, min: null, description: 'Items that must be in the main hand', pick: ['vanilla:items', 'refs:vulcan:items'] },
  min: { name: 'min', kind: 'INTEGER', required: false, default: null, min: null, description: 'Lowest block Y that counts' },
  max: { name: 'max', kind: 'INTEGER', required: false, default: null, min: null, description: 'Highest block Y that counts' },
}
function filterParam(name: 'worlds' | 'hand' | 'min' | 'max'): ParamDto {
  return catalog.value?.response.catalog.quest_fields?.filters?.find((f) => f.name === name) ?? FALLBACK_FILTERS[name]!
}
const WORLD_PARAM = computed(() => filterParam('worlds'))
const HAND_PARAM = computed(() => filterParam('hand'))
const Y_MIN = computed(() => ({ ...filterParam('min'), name: 'min y' }))
const Y_MAX = computed(() => ({ ...filterParam('max'), name: 'max y' }))
const DISPLAY: ParamDto = { name: 'display', kind: 'TEXT', required: false, default: null, min: null, description: OBJECTIVE_FIELDS.display }
const AMOUNT: ParamDto = { name: 'amount', kind: 'INTEGER', required: false, default: '1', min: 1, description: OBJECTIVE_FIELDS.amount }
const FAIL_AMOUNT: ParamDto = { ...AMOUNT, description: 'How many times it may happen: the quest fails when it reaches this' }
const LINE_DISPLAY: ParamDto = { name: 'display', kind: 'TEXT', required: false, default: null, min: null, description: 'Its line in /quests menus (MiniMessage); empty = generated' }
const ENTRY_DISPLAY: ParamDto = { name: 'display', kind: 'TEXT', required: false, default: null, min: null, description: 'Replaces the line shown in menus (MiniMessage)' }

/** The types an entry can change to (the in-game editor's "change the type"). */
const typeChoices = computed(() => {
  const e = entry.value
  if (!e || !catalog.value) return []
  const choices = catalog.value.list(e.category)
    .filter((t) => !(t.id === 'custom' && where.value?.kind === 'when'))
    // Never a requirement type its place cannot take
    .filter((t) => !use.value || takesType(catalog.value!.response.catalog, use.value, t))
    .map((t) => ({ value: t.id, label: prettyType(t.id), hint: ownerLabel(t.owner) }))
  if (!choices.some((c) => c.value === e.type)) choices.unshift({ value: e.type, label: prettyType(e.type), hint: 'unknown type' })
  return choices
})

function changeType(type: string) {
  if (!type || !entry.value || type === entry.value.type) return
  const params = catalog.value?.type(entry.value.category, type)?.params.map((p) => p.name) ?? []
  onEntry((e, m) => retype(m, e.nid, type, params))
}

/** Takes the selected group apart: its requirements take its place. */
function ungroupSelected() {
  const nid = key.value
  if (!nid) return
  onModel((m) => dissolveGroup(m, nid))
  editor.state.selection = null
}

function listOf(m: QuestModel, nids: Nid[]) {
  return nids.map((nid) => ({ nid, entry: m.entries[nid]! })).filter((x) => x.entry)
}

const BUTTON = 'rounded-md border border-night-600 px-2 py-1 text-xs hover:border-gold-400 disabled:opacity-40'
const DANGER = 'rounded-md border border-red-900 px-2 py-1 text-xs text-red-300 hover:border-red-400'
</script>

<template>
  <section aria-label="Inspector" class="flex flex-col gap-4 p-3 text-sm">
    <p v-if="!sel" class="text-night-400">Select a quest box or a part to edit it. Drag types from the left into a quest; drag from a quest's
      <span class="text-gold-300">starts</span>, <span class="text-emerald-300">unlocks</span>, <span class="text-red-300">fail: starts</span> or
      <span class="text-red-300">fail: unlocks</span> handle to another quest to link them.</p>

    <!-- A line between quests -->
    <template v-else-if="sel.kind === 'link'">
      <div v-if="line">
        <p class="eyebrow mb-1">Line</p>
        <p v-if="line.kind === 'starts'"><span class="font-mono">{{ line.from }}</span> <span class="text-gold-300">starts</span> <span class="font-mono">{{ line.to }}</span>:
          finishing {{ line.from }} starts {{ line.to }} (a start_quest reward of {{ line.from }}).</p>
        <p v-else-if="line.kind === 'unlocks'"><span class="font-mono">{{ line.from }}</span> <span class="text-emerald-300">unlocks</span> <span class="font-mono">{{ line.to }}</span>:
          {{ line.to }} can start once {{ line.from }} is completed (a quest_completed requirement of {{ line.to }}).</p>
        <p v-else-if="line.kind === 'fails'"><span class="font-mono">{{ line.from }}</span> <span class="text-red-300">on fail starts</span> <span class="font-mono">{{ line.to }}</span>:
          when {{ line.from }} fails, {{ line.to }} starts (a start_quest in the fail actions of {{ line.from }}).</p>
        <p v-else><span class="font-mono">{{ line.from }}</span> <span class="text-red-300">on fail unlocks</span> <span class="font-mono">{{ line.to }}</span>:
          {{ line.to }} can start once the player has failed {{ line.from }} (a quest_failed requirement of {{ line.to }}).</p>
        <div class="mt-3 flex gap-2">
          <button type="button" :class="BUTTON" @click="editor.state.selection = { kind: 'part', quest: line.holder, key: line.nid }">Edit the entry</button>
          <button type="button" :class="DANGER" @click="editor.deleteSelection()">Delete the line</button>
        </div>
      </div>
    </template>

    <!-- A line of the stage chain -->
    <template v-else-if="sel.kind === 'chain'">
      <p class="eyebrow">Stage chain</p>
      <p class="text-night-300">Stages run in the order of this chain, from Start to Finish. Deleting this line takes
        <span class="text-night-100">{{ model && stageNumbers(model).numbers.has(sel.stage) ? `Stage ${stageNumbers(model).numbers.get(sel.stage)}` : 'its stage' }}</span>
        off the chain: its objectives are left out until you connect it again (drag from a stage's right dot onto the next stage).</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" :class="BUTTON" @click="editor.state.selection = { kind: 'part', quest: sel.quest, key: sel.stage }">Select the stage</button>
        <button type="button" :class="DANGER" @click="editor.deleteSelection()">Delete the line</button>
      </div>
    </template>

    <!-- A quest not on the workspace -->
    <template v-else-if="sel.kind === 'ghost'">
      <p class="eyebrow">Not on this workspace</p>
      <p class="font-mono">{{ sel.quest }}</p>
      <button type="button" :class="BUTTON" @click="editor.addQuest(sel.quest)">Add it to the workspace</button>
    </template>

    <template v-else-if="model && state">
      <!-- Quest settings (the box or its Start) -->
      <template v-if="key === 'start'">
        <div class="flex items-center gap-3">
          <ItemIcon :item="model.settings.icon" size="md" />
          <div class="min-w-0">
            <p class="eyebrow">Quest</p>
            <p class="truncate text-base font-semibold"><MiniText :text="model.settings.name" /></p>
            <p class="font-mono text-xs text-night-400">{{ model.id }} <Chip v-if="!state.base" tone="other">new</Chip></p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" :class="BUTTON" @click="editor.toggleBox(model.id)">{{ editor.state.ws.boxes[model.id]?.open ? 'Close box' : 'Open box' }}</button>
          <button type="button" :class="BUTTON" :disabled="linkedIds(editor.state.ws, model.id).length === 0" @click="editor.loadLinked(model.id)">Load linked quests</button>
          <button type="button" :class="BUTTON" @click="editor.relayout(model.id)">Tidy its parts</button>
          <button type="button" :class="BUTTON" @click="editor.addStageTo(model.id)">Add stage</button>
          <button type="button" :class="BUTTON" :disabled="model.fail.shown" @click="editor.addFail(model.id)">Add fail rules</button>
          <button v-if="auth.owner?.canDelete && state.base" type="button" :class="BUTTON"
                  class="border-red-900 text-red-300 hover:border-red-400" @click="askDelete(model.id)">Delete quest…</button>
        </div>

        <div class="flex flex-col gap-1">
          <label :for="`pool-${model.id}`" class="font-mono text-xs text-night-200">pool<span class="text-red-300"> *</span></label>
          <ChoiceField :id="`pool-${model.id}`" :model-value="model.settings.pool ?? ''" :options="poolChoices" empty-label="choose a pool…"
                       title="The pool it belongs to" @change="setPool" />
          <p class="text-[11px] text-night-400">Pools are made in game and sent with /chronos cl export pool all.</p>
        </div>
        <template v-for="f in fields" :key="f.name">
          <ParamField :uid="`q-${model.id}`" :param="f" :value="setting(model, f.name)" @update="(v) => setSetting(f.name, v)" />
          <p v-if="f.name === 'scope' && scopePool" class="-mt-1 text-[11px] text-gold-300">
            Follows pool {{ scopePool.id }}: {{ scopePool.scope }}
          </p>
        </template>

        <details class="rounded-lg border border-night-800 p-2">
          <summary class="cursor-pointer text-xs text-night-300">Messages</summary>
          <div class="mt-2 flex flex-col gap-3">
            <ParamField v-for="k in messageKeys" :key="k" :uid="`m-${model.id}`" :value="message(model, k)"
                        :param="{ name: k, kind: 'TEXT', required: false, default: null, min: null, description: `Sent on ${k} (MiniMessage); empty = messages.yml` }"
                        @update="(v) => setMessage(k, v)" />
          </div>
        </details>
        <details class="rounded-lg border border-night-800 p-2">
          <summary class="cursor-pointer text-xs text-night-300">Notices (title, sound, particles, firework)</summary>
          <div class="mt-2 flex flex-col gap-3">
            <p v-if="Object.keys(noticeParts).length === 0" class="text-xs text-night-400">Run /chronos cl types to edit notices here.</p>
            <details v-for="event in ['start', 'complete', 'fail']" :key="event" class="rounded-md border border-night-800 p-2">
              <summary class="cursor-pointer text-xs">When the quest {{ event === 'start' ? 'starts' : event === 'complete' ? 'is completed' : 'fails' }}
                <span v-if="model.notices.some(([e]) => e === event)" class="text-gold-300">· changes config.yml's notice</span>
                <span v-else class="text-night-400">· config.yml's notice</span></summary>
              <button type="button" :class="BUTTON" class="mt-2" :disabled="!model.notices.some(([e]) => e === event)"
                      @click="onModel((m) => resetNotice(m, event))">Use config.yml's notice</button>
              <div v-for="(params, part) in noticeParts" :key="part" class="mt-2 flex flex-col gap-2">
                <p class="eyebrow">{{ part }}</p>
                <ParamField v-for="p in params" :key="p.name" :uid="`n-${model.id}-${event}-${part}`" :param="noticeDefault(event, String(part), p)"
                            :value="notice(model, event, String(part), p.name)" @update="(v) => setNotice(event, String(part), p.name, v)" />
              </div>
            </details>
          </div>
        </details>

        <div>
          <p class="eyebrow mb-1">Requirements</p>
          <p class="mb-1 text-[11px] text-night-400">The quest can start once the player meets every one of these. Set one to
            <b>Must not</b> to need the opposite. A group counts when all of its requirements do (or, set to any, at least one).</p>
          <RequirementList :quest="model.id" :nids="model.requirements" empty="None: anyone can start it." />
          <button type="button" :class="BUTTON" class="mt-2" @click="editor.addGroupTo(model.id, 'requirements')">Add group</button>
        </div>
        <button type="button" :class="DANGER" @click="editor.state.selection = { kind: 'box', quest: model.id }; editor.deleteSelection()">
          Remove from this workspace (stays in the database)</button>
      </template>

      <!-- A stage -->
      <template v-else-if="stage">
        <p class="eyebrow">Stage</p>
        <p class="text-night-300">The objectives of a stage run together; the next stage starts once all are done.</p>
        <p v-if="stageNumbers(model).renumbered" class="rounded-md border border-gold-900 bg-gold-900/30 p-2 text-xs text-gold-200">
          The stages were reordered: they are written as 0, 1, 2… again. Players in the middle of this quest may jump to another stage.</p>
        <ul class="flex flex-col gap-1">
          <li v-for="{ nid, entry: e } in listOf(model, stage.objectives)" :key="nid" class="flex items-center gap-1">
            <TypeIcon :category="e.category" :type="e.type" :plain="12" />
            <button type="button" class="min-w-0 flex-1 truncate rounded px-1 text-left text-xs hover:bg-night-800"
                    @click="editor.state.selection = { kind: 'part', quest: model.id, key: nid }"><MiniText :text="sentence(e).mini" /></button>
            <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Earlier" @click="editor.shiftEntry(model.id, nid, -1)">↑</button>
            <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Later" @click="editor.shiftEntry(model.id, nid, 1)">↓</button>
          </li>
          <li v-if="stage.objectives.length === 0" class="text-xs text-night-400">Empty: drag objectives here, or click one in the palette.</li>
        </ul>
        <div>
          <p class="eyebrow mb-1">When it is done, gives</p>
          <ul class="flex flex-col gap-1">
            <li v-for="{ nid, entry: e } in listOf(model, stage.rewards)" :key="nid" class="flex items-center gap-1">
              <TypeIcon :category="e.category" :type="e.type" :plain="12" />
              <button type="button" class="min-w-0 flex-1 truncate rounded px-1 text-left text-xs hover:bg-night-800"
                      @click="editor.state.selection = { kind: 'part', quest: model.id, key: nid }"><MiniText :text="sentence(e).mini" /></button>
              <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Earlier" @click="editor.shiftEntry(model.id, nid, -1)">↑</button>
              <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Later" @click="editor.shiftEntry(model.id, nid, 1)">↓</button>
            </li>
            <li v-if="stage.rewards.length === 0" class="text-xs text-night-400">Nothing: drag a reward onto the stage's top dot.</li>
          </ul>
        </div>
        <div>
          <p class="eyebrow mb-1">When it is done, runs (callbacks)</p>
          <EntryList :quest="model.id" :nids="stage.callbacks" empty="Nothing: drag an action onto the stage's violet dot." />
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" :class="BUTTON" @click="editor.addStageTo(model.id, stage.nid)">Add a stage after it</button>
          <button v-if="model.chain.includes(stage.nid)" type="button" :class="BUTTON" :disabled="model.chain.length === 1"
                  @click="onModel((m) => unchainStage(m, stage!.nid))">Take off the chain</button>
          <button v-else type="button" :class="BUTTON" @click="onModel((m) => void moveStageAfter(m, stage!.nid, m.chain.at(-1) ?? null))">Put on the chain</button>
          <button type="button" :class="BUTTON" @click="editor.renumber(model.id)">Number stages 0, 1, 2…</button>
          <button type="button" :class="DANGER" @click="editor.deleteSelection()">Delete stage</button>
        </div>
      </template>

      <!-- The finish -->
      <template v-else-if="key === 'finish'">
        <p class="eyebrow">Finish</p>
        <ParamField :uid="`f-${model.id}`" :value="message(model, 'complete')"
                    :param="{ name: 'complete message', kind: 'TEXT', required: false, default: null, min: null, description: 'Sent on completion (MiniMessage); empty = messages.yml' }"
                    @update="(v) => setMessage('complete', v)" />
        <p class="eyebrow">Rewards, in order</p>
        <ul class="flex flex-col gap-1">
          <li v-for="{ nid, entry: e } in listOf(model, model.rewards)" :key="nid" class="flex items-center gap-1">
            <TypeIcon :category="e.category" :type="e.type" :plain="12" />
            <button type="button" class="min-w-0 flex-1 truncate rounded px-1 text-left text-xs hover:bg-night-800"
                    @click="editor.state.selection = { kind: 'part', quest: model.id, key: nid }"><MiniText :text="sentence(e).mini" /></button>
            <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Earlier" @click="editor.shiftEntry(model.id, nid, -1)">↑</button>
            <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Later" @click="editor.shiftEntry(model.id, nid, 1)">↓</button>
          </li>
          <li v-if="model.rewards.length === 0" class="text-xs text-night-400">None yet.</li>
        </ul>
      </template>

      <!-- The fail rules -->
      <template v-else-if="key === 'callbacks'">
        <p class="eyebrow text-violet-300!">Callbacks</p>
        <p class="text-xs text-night-300">Actions that run when something happens to a run, once per run. They use the reward types (commands,
          broadcasts, Kleos reputation, summons, the world's time and weather...) and are never listed to players.</p>
        <div v-for="event in CALLBACK_EVENTS" :key="event">
          <p class="eyebrow mb-1">On {{ event }}</p>
          <EntryList :quest="model.id" :nids="model.callbacks[event]" :empty="`Nothing: drag an action onto the '${event}' dot.`" />
        </div>
        <button type="button" :class="DANGER" @click="editor.deleteSelection()">Delete the callbacks</button>
      </template>

      <template v-else-if="key === 'fail'">
        <p class="eyebrow text-red-300!">Fail rules</p>
        <p class="text-xs text-night-300">The quest fails when a <b>when</b> objective happens, or as soon as an <b>unless</b> requirement is not met
          (checked every second).</p>
        <div class="flex flex-col gap-1">
          <label :for="`fr-${model.id}`" class="font-mono text-xs">result</label>
          <select :id="`fr-${model.id}`" class="rounded-md border border-night-700 bg-night-900 px-2 py-1.5 text-sm" :value="model.fail.result"
                  @change="onModel((m) => void (m.fail.result = ($event.target as HTMLSelectElement).value as 'drop' | 'cooldown'))">
            <option value="drop">drop: progress lost, it can be started again</option>
            <option value="cooldown">cooldown: also locked for a while</option>
          </select>
        </div>
        <ParamField :uid="`fc-${model.id}`" :value="model.fail.cooldown ? formatDuration(model.fail.cooldown) : undefined"
                    :param="failFields?.find((f) => f.name === 'cooldown') ?? { name: 'cooldown', kind: 'DURATION', required: model.fail.result === 'cooldown', default: null, min: null, description: 'How long a failure locks it' }"
                    @update="(v) => onModel((m) => { const s = v === undefined ? 0 : tryDuration(String(v)); if (s === null) return 'not a duration'; m.fail.cooldown = s; return null })" />
        <ParamField :uid="`fm-${model.id}`" :value="model.fail.message || undefined"
                    :param="failFields?.find((f) => f.name === 'message') ?? { name: 'message', kind: 'TEXT', required: false, default: null, min: null, description: 'The chat line on failure' }"
                    @update="(v) => onModel((m) => void (m.fail.message = v === undefined ? '' : String(v)))" />
        <div>
          <p class="eyebrow mb-1">Fails when it happens</p>
          <ul class="flex flex-col gap-1">
            <li v-for="{ nid, entry: e } in listOf(model, model.fail.when)" :key="nid" class="flex items-center gap-1">
              <TypeIcon :category="e.category" :type="e.type" :plain="12" />
              <button type="button" class="min-w-0 flex-1 truncate rounded px-1 text-left text-xs hover:bg-night-800"
                      @click="editor.state.selection = { kind: 'part', quest: model.id, key: nid }"><MiniText :text="sentence(e).mini" :placeholders="sentence(e).placeholders" /></button>
              <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Earlier" @click="editor.shiftEntry(model.id, nid, -1)">↑</button>
              <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Later" @click="editor.shiftEntry(model.id, nid, 1)">↓</button>
            </li>
            <li v-if="model.fail.when.length === 0" class="text-xs text-night-400">Nothing: drag objectives to the fail rules' right dot.</li>
          </ul>
        </div>
        <div>
          <p class="eyebrow mb-1">Fails unless</p>
          <p class="mb-1 text-[11px] text-night-400">The quest fails as soon as the player stops meeting one of these. With
            <b>Must not</b> it fails when the player meets it. A group counts when all of its requirements do (or, set to any, at least
            one).</p>
          <RequirementList :quest="model.id" :nids="model.fail.unless" empty="Nothing: drag requirements to the fail rules' left dot." />
          <button type="button" :class="BUTTON" class="mt-2" @click="editor.addGroupTo(model.id, 'unless')">Add group</button>
        </div>
        <p class="text-xs text-night-400">{{ model.fail.when.length }} when, {{ model.fail.unless.length }} unless, {{ model.fail.actions.length }} then:
          drag objectives to its right dot, requirements to its left one, and what failing does (rewards: start_quest another quest, a command,
          a message…) to its bottom one.</p>
        <div v-if="model.fail.actions.length">
          <p class="eyebrow mb-1">Then, in order</p>
          <ul class="flex flex-col gap-1">
            <li v-for="{ nid, entry: e } in listOf(model, model.fail.actions)" :key="nid" class="flex items-center gap-1">
              <TypeIcon :category="e.category" :type="e.type" :plain="12" />
              <button type="button" class="min-w-0 flex-1 truncate rounded px-1 text-left text-xs hover:bg-night-800"
                      @click="editor.state.selection = { kind: 'part', quest: model.id, key: nid }"><MiniText :text="sentence(e).mini" /></button>
              <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Earlier" @click="editor.shiftEntry(model.id, nid, -1)">↑</button>
              <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Later" @click="editor.shiftEntry(model.id, nid, 1)">↓</button>
            </li>
          </ul>
        </div>
        <button type="button" :class="DANGER" @click="editor.deleteSelection()">Delete the fail rules</button>
      </template>

      <!-- A group of requirements -->
      <template v-else-if="group">
        <p class="eyebrow">Group of requirements ({{ groupMode(group) === 'any' ? 'or' : 'and' }})</p>
        <p class="text-xs text-night-300">Counts when <b>all</b> of its requirements do, or, set to any, when <b>at least one</b> does (each
          with its own Must / Must not). <b>Must not</b> flips the whole group: not all of them, or none of them. Drop requirements on it,
          or drag one out to take it out.</p>
        <div class="rounded-md bg-night-950 px-2 py-1.5 text-xs"><MiniText :text="sentence(group).mini" /></div>
        <div class="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="The group needs" class="inline-flex shrink-0 overflow-hidden rounded-md border border-night-600 text-xs">
            <button v-for="m in GROUP_MODES" :key="m" type="button" class="px-1.5 py-0.5 first:border-r first:border-night-600"
                    :class="groupMode(group) === m ? 'bg-sky-500/25 text-sky-100' : 'text-night-400 hover:text-night-100'" :aria-pressed="groupMode(group) === m"
                    :title="m === 'all' ? 'and: every requirement' : 'or: at least one requirement'"
                    @click="editor.setGroupJoin(model!.id, group!.nid, m)">{{ m }}</button>
          </div>
          <NotSwitch :not="group.not === true" label="The player, for this group" @update="(v) => editor.setNot(model!.id, group!.nid, v)" />
          <span class="text-xs text-night-300">{{ groupLabel(groupMode(group), group.not === true) }} its requirements</span>
        </div>
        <ParamField :uid="`d-${group.nid}`" :param="ENTRY_DISPLAY" :value="group.display || undefined"
                    @update="(v) => onEntry((e) => void (e.display = v === undefined ? '' : String(v)))" />
        <div class="flex flex-col gap-1">
          <label :for="`where-${group.nid}`" class="font-mono text-xs">where</label>
          <ChoiceField :id="`where-${group.nid}`" :model-value="String(whereIndex)" title="Where it sits in the quest"
                       :options="[{ value: '-1', label: 'not connected (left out of the quest)' }, ...places.map((p, i) => ({ value: String(i), label: p.label }))]"
                       @change="moveTo" />
        </div>
        <div>
          <p class="eyebrow mb-1">Its requirements</p>
          <RequirementList :quest="model.id" :nids="group.members ?? []" empty="Empty: drop requirements on the group, or wire them to its left dot." />
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" :class="BUTTON" @click="editor.shiftEntry(model.id, group.nid, -1)">Earlier</button>
          <button type="button" :class="BUTTON" @click="editor.shiftEntry(model.id, group.nid, 1)">Later</button>
          <button v-if="groupLevel(model, group.nid) < MAX_GROUP_LEVEL" type="button" :class="BUTTON" title="A group inside this one"
                  @click="editor.addGroupTo(model.id, { group: group!.nid })">Add group</button>
          <button type="button" :class="BUTTON" title="Its requirements take its place" @click="ungroupSelected">Ungroup</button>
          <button type="button" :class="DANGER" @click="editor.deleteSelection()">Delete group</button>
        </div>
      </template>

      <!-- An entry -->
      <template v-else-if="entry">
        <div class="flex items-start gap-3">
          <TypeIcon :category="entry.category" :type="entry.type" size="md" :label="prettyType(entry.type)" />
          <div class="min-w-0">
            <p class="eyebrow">{{ entry.category }} · {{ spec ? ownerLabel(spec.owner) : 'unknown type' }}</p>
            <p class="text-base font-semibold">{{ prettyType(entry.type) }}</p>
            <p class="text-xs text-night-400">{{ spec?.description ?? `The server does not know ${entry.type}: it is kept as it is.` }}</p>
            <p v-if="catalog?.note(entry.category, entry.type)" class="mt-1 text-xs text-night-300">{{ catalog.note(entry.category, entry.type) }}</p>
          </div>
        </div>
        <div class="rounded-md bg-night-950 px-2 py-1.5 text-xs"><MiniText :text="sentence(entry).mini" :placeholders="sentence(entry).placeholders" /></div>
        <div v-if="entry.category === 'requirement'" class="flex flex-wrap items-center gap-2">
          <NotSwitch :not="entry.not === true" @update="(v) => editor.setNot(model!.id, entry!.nid, v)" />
          <span class="text-xs text-night-300">{{ entry.not ? 'The player must not meet this' : 'The player must meet this' }}</span>
          <button v-if="where?.kind === 'group'" type="button" :class="BUTTON" @click="editor.ungroup(model.id, entry.nid)">Take out of the group</button>
        </div>

        <div v-if="typeChoices.length > 1" class="flex flex-col gap-1">
          <label :for="`type-${entry.nid}`" class="font-mono text-xs">type</label>
          <ChoiceField :id="`type-${entry.nid}`" :model-value="entry.type" :options="typeChoices" :title="`Change the ${entry.category} type`"
                       @change="changeType" />
          <p class="text-[11px] text-night-400">Arguments the new type does not have are dropped<template v-if="entry.category === 'objective'">;
            the objective id, amount, display, filters and rewards stay</template>.</p>
        </div>

        <div class="flex flex-col gap-1">
          <label :for="`where-${entry.nid}`" class="font-mono text-xs">where</label>
          <ChoiceField :id="`where-${entry.nid}`" :model-value="String(whereIndex)" title="Where it sits in the quest"
                       :options="[{ value: '-1', label: 'not connected (left out of the quest)' }, ...places.map((p, i) => ({ value: String(i), label: p.label }))]"
                       @change="moveTo" />
        </div>

        <template v-if="entry.category === 'objective' && where?.kind === 'stage'">
          <div class="flex flex-col gap-1">
            <label :for="`oid-${entry.nid}`" class="font-mono text-xs">objective id</label>
            <input :id="`oid-${entry.nid}`" class="rounded-md border border-night-700 bg-night-900 px-2 py-1.5 font-mono text-sm" :value="entry.objectiveId" @change="setObjectiveId" />
            <p class="text-[11px] text-night-400">Players' progress is kept under it: renaming it in a live quest loses their progress on it.</p>
          </div>
        </template>
        <template v-if="entry.category === 'objective'">
          <ParamField :uid="`d-${entry.nid}`" :param="where?.kind === 'when' ? FAIL_AMOUNT : AMOUNT" :value="entry.amount === 1 ? undefined : entry.amount"
                      @update="(v) => onEntry((e) => { const n = v === undefined ? 1 : Number(v); if (!Number.isInteger(n) || n < 1) return 'at least 1'; e.amount = n; return null })" />
          <ParamField :uid="`d-${entry.nid}`" :param="where?.kind === 'when' ? LINE_DISPLAY : DISPLAY" :value="entry.display || undefined"
                      @update="(v) => onEntry((e) => void (e.display = v === undefined ? '' : String(v)))" />
        </template>
        <ParamField v-else :uid="`d-${entry.nid}`" :param="ENTRY_DISPLAY" :value="argOf(entry, 'display')"
                    @update="(v) => onEntry((e) => setArg(e, 'display', v))" />

        <template v-if="spec">
          <ParamField v-for="p in shownParams" :key="p.name" :uid="`a-${entry.nid}`" :param="p" :value="argOf(entry, p.name)" :siblings="entryArgs"
                      @update="(v) => onEntry((e) => setArg(e, p.name, v))" />
        </template>

        <!-- A party reward: party members nearby get it too -->
        <div v-if="entry.category === 'reward' && !ownParty && (rewardTakesParty || entry.party || entry.partyRange !== undefined)" class="flex flex-col gap-2">
          <p class="eyebrow">Party</p>
          <label class="flex items-center gap-2 text-xs">
            <input type="checkbox" class="accent-gold-400" :checked="entry.party === true"
                   @change="onEntry((e) => { if (($event.target as HTMLInputElement).checked) e.party = true; else delete e.party })" />
            Party members get it too
          </label>
          <p v-if="rewardTakesParty" class="text-[11px] text-night-400">Online party members within the range get it as well. Its requirements
            (if any) are read for the player who completes it only.</p>
          <p v-else class="rounded-md border border-red-900 bg-red-950/40 p-2 text-[11px] text-red-200">Party only works on rewards of a quest,
            a stage or an objective: turn it off here, or move the reward there.</p>
          <ParamField :uid="`pr-${entry.nid}`" :param="PARTY_RANGE" :value="entry.partyRange"
                      @update="(v) => onEntry((e) => { if (v === undefined) { delete e.partyRange; return null } const n = Number(v); if (!Number.isFinite(n) || n < 0) return '0 or more'; e.partyRange = n; return null })" />
        </div>

        <!-- An optional reward: given only when its requirements hold -->
        <div v-if="entry.category === 'reward' && (rewardTakesRequirements || (entry.requires?.length ?? 0) > 0)">
          <p class="eyebrow mb-1">Only if</p>
          <p v-if="rewardTakesRequirements" class="mb-1 text-[11px] text-night-400">Given only when all of these hold. If they do not (or it cannot
            be told), it is skipped: the other rewards are still given and the quest still completes. They are read when the objective is done,
            or as the player finishes.</p>
          <p v-else class="mb-1 rounded-md border border-red-900 bg-red-950/40 p-2 text-[11px] text-red-200">Requirements only work on an
            objective's rewards and the quest's rewards: remove them here, or move the reward there.</p>
          <RequirementList :quest="model.id" :nids="entry.requires ?? []" empty="None: it is always given." />
          <div v-if="rewardTakesRequirements" class="mt-2 flex flex-wrap items-center gap-2">
            <ChoiceField :id="`if-${entry.nid}`" model-value="" :options="rewardRequirementTypes" empty-label="add a requirement…"
                         title="Add a requirement: the reward is given only when it holds" @change="addRewardRequirement" />
            <button type="button" :class="BUTTON" @click="editor.addGroupTo(model.id, { reward: entry.nid })">Add group</button>
          </div>
          <button v-else type="button" :class="DANGER" class="mt-2" @click="onEntry((e, m) => clearRewardRequirements(m, e.nid))">Remove the requirements</button>
        </div>

        <div v-if="unknownArgs.length" class="rounded-md border border-night-800 p-2">
          <p class="mb-1 text-xs text-night-300">{{ spec ? 'Arguments this type ignores' : 'Arguments' }} (kept as they are)</p>
          <ul class="flex flex-col gap-1 font-mono text-xs">
            <li v-for="[k, v] in unknownArgs" :key="k" class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate">{{ k }}: {{ Array.isArray(v) ? v.join(', ') : v }}</span>
              <button type="button" class="text-night-400 hover:text-red-300" :aria-label="`Remove ${k}`" @click="onEntry((e) => setArg(e, k, undefined))">×</button>
            </li>
          </ul>
        </div>

        <div v-if="entry.category === 'objective' && where?.kind !== 'when'">
          <p class="eyebrow mb-1">When it is done, gives</p>
          <ul class="flex flex-col gap-1">
            <li v-for="{ nid, entry: e } in listOf(model, entry.rewards ?? [])" :key="nid" class="flex items-center gap-1">
              <TypeIcon :category="e.category" :type="e.type" :plain="12" />
              <button type="button" class="min-w-0 flex-1 truncate rounded px-1 text-left text-xs hover:bg-night-800"
                      @click="editor.state.selection = { kind: 'part', quest: model.id, key: nid }"><MiniText :text="sentence(e).mini" /></button>
              <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Earlier" @click="editor.shiftEntry(model.id, nid, -1)">↑</button>
              <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Later" @click="editor.shiftEntry(model.id, nid, 1)">↓</button>
            </li>
            <li v-if="!(entry.rewards ?? []).length" class="text-xs text-night-400">Nothing: drag a reward onto the objective's bottom dot.</li>
          </ul>
        </div>
        <div v-if="entry.category === 'objective' && where?.kind !== 'when'">
          <p class="eyebrow mb-1">When it is done, runs (callbacks)</p>
          <EntryList :quest="model.id" :nids="entry.callbacks ?? []" empty="Nothing: drag an action onto the objective's violet dot." />
        </div>

        <details v-if="entry.category === 'objective'" class="rounded-lg border border-night-800 p-2">
          <summary class="cursor-pointer text-xs text-night-300">Filters: worlds, item in hand, height</summary>
          <div class="mt-2 flex flex-col gap-3">
            <div class="flex flex-col gap-1">
              <label :for="`wm-${entry.nid}`" class="font-mono text-xs">worlds</label>
              <select :id="`wm-${entry.nid}`" class="rounded-md border border-night-700 bg-night-900 px-2 py-1.5 text-sm" :value="entry.filters?.worldMode ?? ''"
                      @change="setFilterWorlds(($event.target as HTMLSelectElement).value, undefined)">
                <option value="">every world</option>
                <option value="whitelist">only these worlds</option>
                <option value="blacklist">every world but these</option>
              </select>
            </div>
            <ParamField v-if="entry.filters?.worldMode" :uid="`fw-${entry.nid}`" :param="WORLD_PARAM" :value="entry.filters.worlds"
                        @update="(v) => setFilterWorlds(entry!.filters!.worldMode!, Array.isArray(v) ? v : [])" />
            <ParamField :uid="`fh-${entry.nid}`" :param="HAND_PARAM" :value="entry.filters?.hand.length ? entry.filters.hand : undefined" @update="(v) => setFilter('hand', v)" />
            <ParamField :uid="`fy-${entry.nid}`" :param="Y_MIN" :value="entry.filters?.minY ?? undefined" @update="(v) => setFilter('minY', v)" />
            <ParamField :uid="`fy-${entry.nid}`" :param="Y_MAX" :value="entry.filters?.maxY ?? undefined" @update="(v) => setFilter('maxY', v)" />
          </div>
        </details>

        <div class="flex flex-wrap gap-2">
          <button type="button" :class="BUTTON" @click="editor.shiftEntry(model.id, entry.nid, -1)">Earlier</button>
          <button type="button" :class="BUTTON" @click="editor.shiftEntry(model.id, entry.nid, 1)">Later</button>
          <button type="button" :class="DANGER" @click="editor.deleteSelection()">Delete</button>
        </div>
      </template>

      <ul v-if="problems.length" class="flex flex-col gap-1" aria-label="Problems here">
        <li v-for="(p, i) in problems" :key="i" class="rounded-md border px-2 py-1 text-xs"
            :class="p.error ? 'border-red-900 bg-red-950/40 text-red-200' : 'border-gold-900 bg-gold-900/30 text-gold-200'">
          <span class="font-mono text-[10px] opacity-70">{{ p.path }}</span> {{ p.message }}
        </li>
      </ul>
    </template>
      <dialog ref="deleteDialog" aria-labelledby="delete-title"
            class="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-red-900 bg-night-900 p-0 text-night-100 backdrop:bg-night-950/80"
            @close="deleting = null">
      <form class="flex flex-col gap-4 p-6" @submit.prevent="confirmDelete">
        <h2 id="delete-title" class="text-lg font-semibold text-red-300">Delete {{ deleting }}?</h2>
        <p class="text-sm text-night-300">
          It is deleted from the website now, and from the game at the next <code>/chronos cl download</code>. Other workspaces lose it
          too. Unsaved changes to it are dropped. This cannot be undone here.
        </p>
        <p v-if="namedBy.length" class="text-sm text-gold-300">Named by {{ namedBy.join(', ') }} on this canvas: their lines to it will point at nothing.</p>
        <label class="flex flex-col gap-1 text-xs text-night-300">Type <span class="font-mono text-night-100">{{ deleting }}</span> to confirm
          <input v-model="typed" class="rounded-md border border-night-700 bg-night-950 px-2 py-1.5 font-mono text-sm text-night-100" autocomplete="off"
                 spellcheck="false" />
        </label>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="rounded-md border border-night-600 px-3 py-2 text-sm hover:border-gold-400" @click="deleteDialog?.close()">Keep it</button>
          <button type="submit" class="rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-night-950 hover:bg-red-400 disabled:opacity-50"
                  :disabled="busy || typed.trim() !== deleting">{{ busy ? 'Deleting…' : 'Delete quest' }}</button>
        </div>
      </form>
    </dialog>
  </section>
</template>
