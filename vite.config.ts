import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// One app: the Vue site (src/) and the Worker API (worker/), served together by `vite` and deployed by `wrangler deploy`.
// `vite --mode offline` (npm run dev:local) keeps every binding local, even ones wrangler.jsonc marks "remote": true.
export default defineConfig(({ mode }) => ({
  plugins: [vue(), tailwindcss(), cloudflare({ remoteBindings: mode !== 'offline' })],
}))
