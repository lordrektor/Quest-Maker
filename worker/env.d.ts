// Secrets are not in wrangler.jsonc, so `wrangler types` does not know them
interface Env {
  /** The shared secret of the plugin (cloudflare.yml `secret`). */
  CHRONOS_SECRET: string
}
