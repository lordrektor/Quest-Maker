<script setup lang="ts">
import ChronosLogo from './components/ChronosLogo.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth, logout } from './auth'
import { SITE_TITLE } from './title'

const route = useRoute()
const router = useRouter()
const fullscreen = computed(() => route.meta.fullscreen === true)
const container = computed(() => (fullscreen.value ? 'px-4' : 'mx-auto max-w-6xl px-4 sm:px-6'))
let signingOut = false

// A session that ends on a creator page (expired, signed out elsewhere) goes back to the code page
watch(() => auth.status, (status) => {
  if (status === 'out' && route.meta.auth && !signingOut) {
    void router.replace({ name: 'login', query: { next: route.fullPath } })
  }
})

async function signOut() {
  signingOut = true
  try {
    await logout()
    if (route.meta.auth) await router.replace({ name: 'home' })
  } finally {
    signingOut = false
  }
}

const inCreator = computed(() => route.path === '/create' || route.path.startsWith('/create/'))

/** The "More" menu: pages about the project. */
const MORE = [{ to: '/about', label: 'LordRektor', hint: 'Who builds Chronos, and the back story' }]
const inMore = computed(() => MORE.some((l) => route.path === l.to))
const moreOpen = ref(false)
const more = ref<HTMLElement | null>(null)
watch(() => route.fullPath, () => (moreOpen.value = false))

function closeOutside(event: Event) {
  if (moreOpen.value && more.value && !more.value.contains(event.target as Node)) moreOpen.value = false
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && moreOpen.value) {
    moreOpen.value = false
    more.value?.querySelector('button')?.focus()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', closeOutside)
  document.addEventListener('keydown', closeOnEscape)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOutside)
  document.removeEventListener('keydown', closeOnEscape)
})

const NAV = 'rounded-lg px-2 py-1 text-sm hover:text-night-100'
</script>

<template>
  <a
    href="#main"
    class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-gold-400 focus:px-3 focus:py-2 focus:text-night-950"
  >Skip to content</a>
  <div class="flex min-h-screen flex-col">
    <header class="border-b border-night-800/80 bg-night-950/70 backdrop-blur">
      <div class="flex items-center justify-between gap-4 py-3" :class="container">
        <RouterLink to="/" class="flex items-center gap-2.5 rounded-lg" :aria-label="`${SITE_TITLE}, home`">
          <ChronosLogo :size="28" />
          <span class="hidden font-display text-base tracking-wide text-gold-300 min-[400px]:inline sm:text-lg">Chronos <span class="text-night-100">Quests</span></span>
        </RouterLink>
        <nav aria-label="Main" class="flex items-center gap-1 sm:gap-3">
          <RouterLink to="/" :class="[NAV, route.name === 'home' ? 'text-gold-300' : 'text-night-300']">Showcase</RouterLink>
          <RouterLink
            to="/create"
            :class="[NAV, inCreator ? 'text-gold-300' : 'text-night-300']"
            :aria-current="inCreator ? 'page' : undefined"
          >Creator</RouterLink>
          <div ref="more" class="relative">
            <button
              type="button"
              :class="[NAV, 'inline-flex items-center gap-1', inMore || moreOpen ? 'text-gold-300' : 'text-night-300']"
              aria-haspopup="true"
              :aria-expanded="moreOpen"
              aria-controls="nav-more"
              @click="moreOpen = !moreOpen"
            >More <span aria-hidden="true" class="text-[10px] transition" :class="moreOpen ? 'rotate-180' : ''">▾</span></button>
            <div v-if="moreOpen" id="nav-more" class="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-night-700 bg-night-900 p-1.5 shadow-2xl shadow-black/50">
              <RouterLink
                v-for="link in MORE"
                :key="link.to"
                :to="link.to"
                class="block rounded-lg px-3 py-2 hover:bg-night-800 focus-visible:bg-night-800"
                :aria-current="route.path === link.to ? 'page' : undefined"
              >
                <span class="block text-sm font-semibold" :class="route.path === link.to ? 'text-gold-300' : 'text-night-100'">{{ link.label }}</span>
                <span class="block text-xs text-night-400">{{ link.hint }}</span>
              </RouterLink>
            </div>
          </div>
          <template v-if="auth.status === 'in'">
            <span
              class="hidden max-w-40 truncate rounded-lg bg-night-850 px-2.5 py-1 text-sm text-night-200 sm:inline"
              :title="auth.owner?.dev ? 'Signed in by PUBLIC_API (local development)' : undefined"
            >{{ auth.owner?.ownerName }}</span>
            <button v-if="!auth.owner?.dev" type="button" :class="[NAV, 'text-night-300']" @click="signOut">Sign out</button>
          </template>
          <RouterLink
            v-else-if="auth.status === 'out' && route.name !== 'login'"
            :to="{ name: 'login' }"
            class="rounded-lg border border-night-600 px-2.5 py-1 text-sm text-night-200 hover:border-gold-400 hover:text-night-100"
          >Sign in</RouterLink>
        </nav>
      </div>
    </header>

    <main v-if="fullscreen" id="main" class="flex w-full flex-1 flex-col">
      <!-- A new workspace is a new page (its own editor), even from another workspace -->
      <RouterView :key="route.path" />
    </main>
    <main v-else id="main" class="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <RouterView />
    </main>

    <footer v-if="!fullscreen" class="border-t border-night-800/80">
      <div class="mx-auto max-w-6xl px-4 py-6 text-sm text-night-400 sm:px-6">
        Chronos is a quest plugin for Folia servers. The creator saves quests to this site only; the server picks them up
        when an admin runs <span class="text-night-300">/chronos cl download</span>. Progress lives in game.
      </div>
    </footer>
  </div>
</template>
