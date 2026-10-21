import { createRouter, createWebHistory } from 'vue-router'
import { auth, ensureChecked, safeNext } from './auth'
import HomePage from './pages/HomePage.vue'
import LoginPage from './pages/LoginPage.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Needs a session (a code from /chronos cl otp); every other page is public. */
    auth?: boolean
    /** Uses the whole window width (the workspace canvas). */
    fullscreen?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/login', name: 'login', component: LoginPage },
    { path: '/about', name: 'about', component: () => import('./pages/AboutPage.vue') },
    { path: '/create', name: 'create', component: () => import('./pages/CreatorStart.vue'), meta: { auth: true } },
    {
      path: '/create/:workspace',
      name: 'workspace',
      component: () => import('./creator/WorkspacePage.vue'),
      props: true,
      meta: { auth: true, fullscreen: true },
    },
    { path: '/:rest(.*)*', name: 'not-found', component: () => import('./pages/NotFoundPage.vue') },
  ],
  scrollBehavior(to, _from, saved) {
    if (saved) return saved
    // The showcase's in-page links (#example, #pools...)
    if (to.hash) return { el: to.hash }
    return { top: 0 }
  },
})

/** The creator asks for a code from /chronos cl otp; the showcase is open to everyone. */
router.beforeEach(async (to) => {
  await ensureChecked()
  const signedIn = auth.status === 'in'
  if (!signedIn && to.meta.auth) return { name: 'login', query: { next: to.fullPath } }
  if (signedIn && to.name === 'login') return safeNext(to.query.next, '/create')
  return true
})
