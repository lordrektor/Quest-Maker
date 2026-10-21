<script setup lang="ts">
/**
 * A workspace: its quests on one canvas. Types on the left, the canvas in the middle, the selected part's settings,
 * the problems and a player's preview on the right. Saving writes the workspace and its changed quests to the
 * database (all or nothing); the game takes them with /chronos cl download.
 */
import PixelIcon from '../components/PixelIcon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter, type RouteLocationNormalized } from 'vue-router'
import type { WorkspaceSummary } from '../../shared/creator'
import { fetchMyWorkspaces } from './api'
import ChoiceField from '../components/ChoiceField.vue'
import QuestPreview from '../components/QuestPreview.vue'
import { usePageTitle } from '../title'
import WorkspaceCanvas from './canvas/WorkspaceCanvas.vue'
import { createEditor, provideEditor } from './editor'
import { modelToTree } from './model'
import Inspector from './panels/Inspector.vue'
import Palette from './panels/Palette.vue'
import ProblemsPanel from './panels/ProblemsPanel.vue'

const props = defineProps<{ workspace: string }>()
usePageTitle(() => `${props.workspace} · Creator`)

const router = useRouter()
const editor = createEditor(props.workspace)
provideEditor(editor)
const s = editor.state

const questId = ref('')
const side = ref<'inspector' | 'problems'>('inspector')
const previewDialog = ref<HTMLDialogElement | null>(null)

function openPreview() {
  previewDialog.value?.showModal()
}

// The side panels' widths (wide screens), dragged by their edges and kept in this browser
const PANEL_KEY = 'chronos.creator.panels'
const panels = ref(readPanels())

function readPanels(): { left: number; right: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(PANEL_KEY) ?? 'null') as { left?: unknown; right?: unknown } | null
    return { left: typeof raw?.left === 'number' ? raw.left : 256, right: typeof raw?.right === 'number' ? raw.right : 360 }
  } catch {
    return { left: 256, right: 360 }
  }
}

function setPanel(side: 'left' | 'right', width: number) {
  panels.value = { ...panels.value, [side]: Math.round(Math.min(720, Math.max(200, width))) }
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify(panels.value))
  } catch {
    // Not kept
  }
}

/** Drags a panel's edge: the left panel grows to the right, the right one to the left. */
function startResize(side: 'left' | 'right', event: PointerEvent) {
  const startX = event.clientX
  const start = panels.value[side]
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  const move = (e: PointerEvent) => setPanel(side, start + (side === 'left' ? e.clientX - startX : startX - e.clientX))
  const end = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', end)
    target.removeEventListener('pointercancel', end)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', end)
  target.addEventListener('pointercancel', end)
}

function resizeKey(side: 'left' | 'right', event: KeyboardEvent) {
  const step = event.shiftKey ? 64 : 16
  const grow = side === 'left' ? event.key === 'ArrowRight' : event.key === 'ArrowLeft'
  const shrink = side === 'left' ? event.key === 'ArrowLeft' : event.key === 'ArrowRight'
  if (!grow && !shrink) return
  event.preventDefault()
  setPanel(side, panels.value[side] + (grow ? step : -step))
}
// The types start hidden on narrow screens, where the canvas needs the room
const showPalette = ref(typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches)
const copied = ref(false)

const selectedQuest = computed(() => {
  const sel = s.selection
  if (sel && 'quest' in sel && s.ws.quests[sel.quest]) return sel.quest
  if (sel?.kind === 'link') return sel.holder
  return s.ws.order[0]
})
const preview = computed(() => (selectedQuest.value ? modelToTree(s.ws.quests[selectedQuest.value]!.model) : null))
const catalogMissing = computed(() => !s.loading && !s.loadError && !editor.catalog.value?.ready)
/** The game takes the quests of this workspace (not the workspace itself) */
const downloadCommand = computed(() => `/chronos cl download ws ${props.workspace}`)

async function addQuest() {
  if (await editor.addQuest(questId.value)) questId.value = ''
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // The text is on screen to copy by hand
  }
}

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function onKey(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey
  if (mod && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void editor.save()
    return
  }
  if (typing(event.target)) return
  if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
    event.preventDefault()
    editor.undo()
  } else if (mod && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
    event.preventDefault()
    editor.redo()
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    if (s.selection) {
      event.preventDefault()
      editor.deleteSelection()
    }
  } else if (event.key === 'Escape') {
    s.selection = null
  }
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (editor.unsaved.value) event.preventDefault()
}

// The switcher lists your own workspaces (and the one open, which may be someone else's)
const mine = ref<WorkspaceSummary[]>([])
const switchable = computed(() => {
  const names = mine.value.map((w) => w.name)
  return names.includes(props.workspace) ? names : [props.workspace, ...names]
})

function onSwitch(value: string) {
  if (value === props.workspace) return
  if (value === '') void router.push({ name: 'create' })
  else void router.push({ name: 'workspace', params: { workspace: value } })
}

// Leaving with unsaved changes asks first (a modal): save and go, go (the changes stay in this browser), or stay
const leaveDialog = ref<HTMLDialogElement | null>(null)
const leaving = ref<{ resolve: (go: boolean) => void; where: string } | null>(null)

function confirmLeave(to: RouteLocationNormalized): boolean | Promise<boolean> {
  if (!editor.unsaved.value) return true
  return new Promise((resolve) => {
    const target = to.name === 'workspace' ? `workspace ${String(to.params.workspace)}` : to.name === 'create' ? 'your workspaces' : 'this page'
    leaving.value = { resolve, where: target }
    void nextTick(() => leaveDialog.value?.showModal())
  })
}

async function decide(choice: 'stay' | 'go' | 'save') {
  const pending = leaving.value
  if (!pending) return
  if (choice === 'save') {
    await editor.save()
    // Not saved (errors, a conflict, offline): stay and show why
    if (editor.unsaved.value) choice = 'stay'
  }
  leaving.value = null
  leaveDialog.value?.close()
  pending.resolve(choice !== 'stay')
}

onMounted(() => {
  fetchMyWorkspaces().then((list) => (mine.value = list)).catch(() => {
    // The switcher then offers the open workspace and "Your workspaces" only
  })
  void editor.load()
  window.addEventListener('keydown', onKey)
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('beforeunload', beforeUnload)
})
onBeforeRouteLeave((to) => confirmLeave(to))
onBeforeRouteUpdate((to) => confirmLeave(to))

const BUTTON = 'rounded-md border border-night-600 px-2.5 py-1.5 text-xs hover:border-gold-400 disabled:opacity-40 disabled:hover:border-night-600'
const TAB = 'px-3 py-2 text-xs'
</script>

<template>
  <div class="flex flex-col overflow-hidden" style="height: calc(100dvh - 57px)">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-2 border-b border-night-800 bg-night-900/80 px-3 py-2">
      <h1 class="sr-only">Workspace {{ workspace }}</h1>
      <label for="switch-workspace" class="text-xs text-night-400">Workspace</label>
      <ChoiceField id="switch-workspace" :model-value="workspace" title="Switch workspace" input-class="max-w-56 font-mono font-semibold"
                   :options="[...switchable, { value: '', label: 'Your workspaces, or a new one…' }]" @change="onSwitch" />
      <form class="ml-2 flex items-center gap-1" @submit.prevent="addQuest">
        <label for="add-quest" class="sr-only">Quest id</label>
        <input id="add-quest" v-model="questId" placeholder="quest id" autocomplete="off" spellcheck="false"
               class="w-36 rounded-md border border-night-700 bg-night-950 px-2 py-1.5 font-mono text-xs focus:border-gold-400 focus:outline-none sm:w-44" />
        <button type="submit" :class="BUTTON" :disabled="questId.trim() === ''"><PixelIcon name="plus" :size="11" class="mr-1 align-[-1px]" />Add quest</button>
      </form>
      <div class="flex items-center gap-1">
        <button type="button" :class="BUTTON" :disabled="!editor.history.canUndo" title="Undo (Ctrl+Z)" @click="editor.undo()"><PixelIcon name="undo" :size="11" class="mr-1 align-[-1px]" />Undo</button>
        <button type="button" :class="BUTTON" :disabled="!editor.history.canRedo" title="Redo (Ctrl+Y)" @click="editor.redo()"><PixelIcon name="redo" :size="11" class="mr-1 align-[-1px]" />Redo</button>
        <button type="button" :class="BUTTON" :disabled="s.ws.order.length === 0" title="Lay the quests out along their lines" @click="editor.relayoutBoxes()"><PixelIcon name="tidy" :size="11" class="mr-1 align-[-1px]" />Tidy</button>
        <button type="button" :class="BUTTON" class="hidden sm:inline" @click="editor.setAllOpen(true)">Open all</button>
        <button type="button" :class="BUTTON" class="hidden sm:inline" @click="editor.setAllOpen(false)">Close all</button>
        <button type="button" :class="BUTTON" class="lg:hidden" @click="showPalette = !showPalette">{{ showPalette ? 'Hide types' : 'Types' }}</button>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <span class="text-xs" :class="editor.checked.value.errors ? 'text-red-300' : 'text-night-400'">
          {{ editor.checked.value.errors }} error{{ editor.checked.value.errors === 1 ? '' : 's' }},
          {{ editor.checked.value.warnings }} warning{{ editor.checked.value.warnings === 1 ? '' : 's' }}
        </span>
        <button
          type="button"
          class="rounded-md bg-gold-400 px-3 py-1.5 text-xs font-semibold text-night-950 hover:bg-gold-300 disabled:opacity-50"
          :disabled="s.saving || !editor.unsaved.value || editor.checked.value.errors > 0"
          :title="editor.checked.value.errors > 0 ? 'Fix the errors first' : 'Save to the database (Ctrl+S)'"
          @click="editor.save()"
        ><PixelIcon name="save" :size="11" class="mr-1 align-[-1px]" />{{ s.saving ? 'Saving…' : editor.unsaved.value ? `Save${editor.dirty.value.length ? ` (${editor.dirty.value.length})` : ''}` : 'Saved' }}</button>
      </div>
    </div>

    <!-- Messages -->
    <div class="flex flex-col gap-1 px-3 empty:hidden" aria-live="polite">
      <p v-if="catalogMissing" class="mt-2 rounded-md border border-gold-900 bg-gold-900/30 px-3 py-2 text-xs text-gold-200">
        The server has not sent its quest types yet. In game, run <code class="text-gold-100">/chronos cl types</code> (and
        <code class="text-gold-100">/chronos cl refs &lt;plugin&gt;</code> for Vulcan, Tyche, ExperienceTailor, Chrysos, Kleos, Crius, Metabasis, Convo and Plutus ids), then reload this page.
      </p>
      <div v-if="s.draft" class="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-sky-900 bg-sky-950/40 px-3 py-2 text-xs text-sky-200">
        <span>Unsaved changes from {{ new Date(s.draft.at).toLocaleString() }} are kept in this browser.</span>
        <button type="button" :class="BUTTON" @click="editor.restoreDraft()">Restore them</button>
        <button type="button" :class="BUTTON" @click="editor.discardDraft()">Discard</button>
      </div>
      <div v-if="s.conflict" class="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-200" role="alert">
        <span>Saved by someone else after you opened them:
          {{ [...s.conflict.quests.map((q) => q.id), ...(s.conflict.workspace ? ['the workspace'] : [])].join(', ') }}.</span>
        <button type="button" :class="BUTTON" @click="editor.takeTheirs()">Load theirs (drop my changes to those)</button>
        <button type="button" :class="BUTTON" @click="editor.save(true)">Keep mine and save over theirs</button>
      </div>
      <div v-if="s.saved && s.saved.length > 0" class="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-emerald-900 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-200">
        <span>Saved to the database. To put it in the game, an admin runs</span>
        <code class="rounded bg-night-950 px-1.5 py-0.5 text-night-100">{{ downloadCommand }}</code>
        <button type="button" :class="BUTTON" @click="copy(downloadCommand)">{{ copied ? 'Copied' : 'Copy' }}</button>
      </div>
      <p v-if="s.notice" class="mt-2 flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-xs"
         :class="{ info: 'bg-night-800 text-night-200', error: 'bg-red-950/50 text-red-200', success: 'bg-emerald-900/30 text-emerald-200' }[s.notice.tone]">
        <span>{{ s.notice.text }}</span>
        <button type="button" class="text-night-400 hover:text-night-100" aria-label="Dismiss" @click="s.notice = null">×</button>
      </p>
    </div>

    <div v-if="s.loading" class="grid flex-1 place-items-center text-night-400" role="status">Opening {{ workspace }}…</div>
    <div v-else-if="s.loadError" class="grid flex-1 place-items-center p-6" role="alert">
      <div class="card max-w-md px-6 py-8 text-center">
        <p class="eyebrow mb-2">Could not open the workspace</p>
        <p class="text-night-300">{{ s.loadError }}</p>
        <button type="button" class="mt-4" :class="BUTTON" @click="editor.load()">Try again</button>
      </div>
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside v-show="showPalette" class="h-64 min-h-0 shrink-0 border-b border-night-800 bg-night-900/70 lg:h-auto lg:w-(--left) lg:border-b-0"
             :style="{ '--left': `${panels.left}px` }">
        <Palette />
      </aside>
      <div v-show="showPalette" role="separator" aria-orientation="vertical" aria-label="Resize the types panel" tabindex="0"
           :aria-valuenow="panels.left" aria-valuemin="200" aria-valuemax="720"
           class="hidden w-1.5 shrink-0 cursor-col-resize bg-night-800 hover:bg-gold-400/60 focus-visible:bg-gold-400 lg:block"
           @pointerdown.prevent="startResize('left', $event)" @keydown="resizeKey('left', $event)" />
      <div class="min-h-[300px] min-w-0 flex-1">
        <WorkspaceCanvas />
      </div>
      <div role="separator" aria-orientation="vertical" aria-label="Resize the settings panel" tabindex="0"
           :aria-valuenow="panels.right" aria-valuemin="200" aria-valuemax="720"
           class="hidden w-1.5 shrink-0 cursor-col-resize bg-night-800 hover:bg-gold-400/60 focus-visible:bg-gold-400 lg:block"
           @pointerdown.prevent="startResize('right', $event)" @keydown="resizeKey('right', $event)" />
      <aside class="flex max-h-[45vh] min-h-0 shrink-0 flex-col border-t border-night-800 bg-night-900/70 lg:max-h-none lg:w-(--right) lg:border-t-0"
             :style="{ '--right': `${panels.right}px` }">
        <div role="tablist" class="flex border-b border-night-800">
          <button type="button" role="tab" :aria-selected="side === 'inspector'" :class="[TAB, side === 'inspector' ? 'border-b-2 border-gold-400 text-gold-300' : 'text-night-300']" @click="side = 'inspector'"><PixelIcon name="quest" :size="12" class="mr-1 align-[-1px]" />Settings</button>
          <button type="button" role="tab" :aria-selected="side === 'problems'" :class="[TAB, side === 'problems' ? 'border-b-2 border-gold-400 text-gold-300' : 'text-night-300']" @click="side = 'problems'">
            <PixelIcon name="warning" :size="12" class="mr-1 align-[-1px]" />Problems<span v-if="editor.checked.value.errors" class="ml-1 rounded-full bg-red-900 px-1.5 text-[10px] text-red-100">{{ editor.checked.value.errors }}</span>
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Inspector v-if="side === 'inspector'" />
          <ProblemsPanel v-else />
        </div>
        <div class="border-t border-night-800 p-2">
          <button type="button" class="w-full rounded-md border border-night-600 px-3 py-2 text-sm hover:border-gold-400 disabled:opacity-40"
                  :disabled="!preview" @click="openPreview">
            <PixelIcon name="eye" :size="14" class="mr-1.5 align-[-2px]" />Preview{{ selectedQuest ? ` ${selectedQuest}` : '' }} as a player sees it
          </button>
        </div>
      </aside>
    </div>

    <dialog ref="leaveDialog" aria-labelledby="leave-title"
            class="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-night-700 bg-night-900 p-0 text-night-100 backdrop:bg-night-950/80"
            @cancel.prevent="decide('stay')">
      <div class="flex flex-col gap-4 p-6">
        <h2 id="leave-title" class="text-lg font-semibold">Unsaved changes</h2>
        <p class="text-sm text-night-300">
          {{ workspace }} has changes that are not saved to the database{{ editor.dirty.value.length ? ` (${editor.dirty.value.join(', ')})` : '' }}.
          Leave for {{ leaving?.where }}?
        </p>
        <p v-if="editor.checked.value.errors > 0" class="text-xs text-red-300">It cannot be saved yet: fix its {{ editor.checked.value.errors }} error(s) first.</p>
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="rounded-md border border-night-600 px-3 py-2 text-sm hover:border-gold-400" @click="decide('stay')">Stay</button>
          <button type="button" class="rounded-md border border-night-600 px-3 py-2 text-sm hover:border-red-400"
                  title="Your changes stay in this browser as a draft" @click="decide('go')">Leave without saving</button>
          <button type="button" class="rounded-md bg-gold-400 px-3 py-2 text-sm font-semibold text-night-950 hover:bg-gold-300 disabled:opacity-50"
                  :disabled="s.saving || editor.checked.value.errors > 0" @click="decide('save')">{{ s.saving ? 'Saving…' : 'Save and leave' }}</button>
        </div>
        <p class="text-xs text-night-400">Leaving without saving keeps your changes in this browser: opening {{ workspace }} again offers to restore them.</p>
      </div>
    </dialog>

    <dialog ref="previewDialog" aria-label="Quest preview"
            class="m-auto max-h-[90dvh] w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-night-700 bg-night-900 p-0 text-night-100 backdrop:bg-night-950/80"
            @click.self="previewDialog?.close()">
      <div class="flex max-h-[90dvh] flex-col">
        <div class="flex items-center justify-between gap-3 border-b border-night-800 px-5 py-3">
          <p class="eyebrow">Preview · {{ selectedQuest }}</p>
          <button type="button" class="rounded-md px-2 py-1 text-night-300 hover:bg-night-800 hover:text-night-100" aria-label="Close the preview"
                  @click="previewDialog?.close()">✕</button>
        </div>
        <div class="overflow-y-auto px-5 py-6 sm:px-8">
          <QuestPreview v-if="preview" :body="preview" :quest-links="false" :level="2" />
        </div>
      </div>
    </dialog>
  </div>
</template>
