# ChronosCreator

The web side of **Chronos**, the quest plugin: a Cloudflare Worker with a D1 database that the plugin talks to, and the quest website served by the same Worker.

- **Showcase** (`/`, public): what Chronos can do. It shows no server data.
- **Creator** (`/create`, needs a code from `/chronos cl otp`): pick one of your own workspaces (the ones you created; nobody else's are listed) or type a name to open another or start one; switch between them from the canvas's toolbar. Add quests to a workspace by id (an unknown id starts a new quest; quests are never listed), build them by dragging types into them, and join them with **starts** (`start_quest`) and **unlocks** (`quest_completed`) lines. Saving writes to D1 only; an admin brings the workspace's quests into the game with `/chronos cl download ws <name>`.

Built with Vue 3, TypeScript, Tailwind CSS 4 and Vite, plus the Cloudflare Vite plugin, so `vite` runs the site and the Worker together and `wrangler deploy` ships both.

## Layout

| Path | What |
|---|---|
| `worker/` | the Worker: `index.ts` (routes), `auth.ts` (signature check), `definitions.ts`, `otp.ts`, `refs.ts`, `catalog.ts`, `creator.ts`, `session.ts`, `limits.ts` |
| `shared/api.ts`, `shared/creator.ts` | the request and response types the plugin, the Worker and the site share |
| `shared/quest/` | a quest's canonical form and checks, ported from the plugin (`DefinitionCodec`, `DefinitionValidator`): the site and the Worker check alike |
| `migrations/` | D1 tables: `definitions` (with quests deleted on the website, until the game takes the delete), `otps`, `refs`, `meta`, `sessions`, `login_failures`, `catalog`, `workspaces` (with their owner), `layouts` |
| `src/` | the site; `src/creator/` is the workspace editor (model, rules, canvas, panels) |
| `test/` | Vitest tests (`npm test`) |
| `scripts/dev-otp.mjs` | `npm run dev:otp`: a local sign-in code |
| `scripts/seed-local.sql` | example quests for local development |
| `wrangler.example.jsonc` | the Workers, their D1 bindings and settings; copy it to `wrangler.jsonc` (git-ignored) with your D1 ids |

## Icons and images

Every picture on the site is original pixel art, like the Tyche showcase's: no game textures.

- `src/data/icons.json`: the grids. 12x12 icons use `#` (the text colour), `+` (dimmed), `o` (the emerald accent),
  `k` (dark ink) and `.` (empty); the 16x16 `logo` hourglass adds `=` (gold shade), `s` (sand) and `e` (glowing sand).
- `components/PixelIcon.vue` draws an icon, `components/ChronosLogo.vue` the hourglass, and `components/ItemIcon.vue`
  an item: the icon of its family (sword, tool, potion, gem, block, food...) in the colour of its material, or its
  initials when no family fits. The families and colours are in `src/pixels.ts`.
- After editing the grids, `python -I scripts/make_icons.py` checks them and rewrites `public/favicon.svg`,
  `apple-touch-icon.png`, `icon-512.png` and `og-image.png` (add `--preview out.png` for a sheet of every icon). It needs
  Pillow. Once the site has its address, make the `og:image` in `index.html` an absolute URL so link previews show it.

## Running it locally

```bash
npm install
cp .dev.vars.example .dev.vars          # then put a long random CHRONOS_SECRET in it
npx wrangler d1 migrations apply chronos --local
npx wrangler d1 execute chronos --local --file=scripts/seed-local.sql   # example data (optional)
npm run dev:otp                          # a sign-in code, in the local database only
npm run dev:local                        # the site and the API on http://localhost:5173, local database
```

| Script | Database |
|---|---|
| `npm run dev:local` | always the local copy in `.wrangler/state` |
| `npm run dev` | the **development** environment's D1 (`chronos-development`, see [Two environments](#two-environments-uat-and-development)); never UAT |

The site asks for a code first. Locally, `npm run dev:otp` writes one into the local database (it works once, for 10 minutes). With a live database the code comes from `/chronos cl otp` in game. `PUBLIC_API=true` in `.dev.vars` skips the code page while working on the pages.

To try it with a Minecraft server, set Chronos's `cloudflare.yml` to `worker_url: "http://127.0.0.1:5173"` and the same secret, then `/chronos reload`, `/chronos cl status`, and `/chronos cl types` so the creator knows the server's types (`/chronos cl types <section>` sends one section). Without a catalog the creator still opens, but it cannot check types and says so.

## Two environments: UAT and development

`wrangler.jsonc` holds two Workers, each with its own D1 and its own `CHRONOS_SECRET`. It is not in the repository (it holds your D1 ids): copy `wrangler.example.jsonc` to `wrangler.jsonc` and put in the ids `npx wrangler d1 create` prints.

| | Worker | D1 | Deploy | Migrate |
|---|---|---|---|---|
| UAT (the top level) | `chronos-creator` | `chronos` | `npm run deploy` | `npm run db:migrate:remote` |
| development (`env.development`) | `chronos-creator-development` | `chronos-development` | `npm run deploy:development` | `npm run db:migrate:development` |

`npm run dev` runs the site on your machine against the development D1 (`.env.development` sets `CLOUDFLARE_ENV=development`), so local work never changes UAT data. The development secret lives on Cloudflare (`npx wrangler secret put CHRONOS_SECRET --env development`) and locally in `.dev.vars.development` (git-ignored, like `.dev.vars`). A Minecraft server used for development points its `cloudflare.yml` at the development Worker's URL with that secret. Apply a new migration to both: `npm run db:migrate:development` and `npm run db:migrate:remote`.

## Deploying

```bash
npx wrangler login
cp wrangler.example.jsonc wrangler.jsonc
npx wrangler d1 create chronos          # copy the database_id it prints into wrangler.jsonc
npx wrangler d1 migrations apply chronos --remote
npx wrangler secret put CHRONOS_SECRET  # the same secret as Chronos's cloudflare.yml
npm run deploy
```

After an update that adds a file to `migrations/`, apply it before deploying: `npx wrangler d1 migrations apply chronos --remote`.

Put the Worker's URL (`https://chronos-creator.<you>.workers.dev`, or a custom domain) in Chronos's `cloudflare.yml` as `worker_url`.

| Setting (`wrangler.jsonc` vars) | Default | Effect |
|---|---|---|
| `PUBLIC_API` | `"false"` | `"true"` opens the site without a code (development only). Keep it off on Cloudflare: the site is only for people with a code from `/chronos cl otp` |
| `SESSION_HOURS` | `"12"` | how long a sign-in lasts |
| `MAX_CLOCK_SKEW_MS` | `"60000"` | how old a signed request from the plugin may be |

## The API

### From the plugin: `POST /chronos/v1/<action>`, signed

Every request carries:

| Header | Value |
|---|---|
| `X-Chronos-Timestamp` | the sender's clock, epoch milliseconds |
| `X-Chronos-Signature` | lowercase hex HMAC-SHA256 of `timestamp + "." + body`, keyed with `CHRONOS_SECRET` |
| `X-Chronos-Server` | the server's name |

A wrong signature, or a timestamp more than `MAX_CLOCK_SKEW_MS` away, is answered with `401`. Answers are `{ "ok": true, ... }` or `{ "ok": false, "error": "..." }`.

| Action | Body | Answer |
|---|---|---|
| `definitions/upsert` | `{ server, items: [{ kind, id, body, version, updatedAt, updatedBy }], overwriteWeb? }` | `{ written, skipped }`. Rows are replaced and marked `source: server`, except rows saved on the web and not downloaded yet (`skipped`), unless `overwriteWeb` |
| `definitions/fetch` | `{ kind, ids }` (`ids: null` = all of that kind) | `{ items: [...] }` with `source` and `server` |
| `workspace/fetch` | `{ name }` | `{ name, items: [...], missing }`: the quests on a workspace, like `definitions/fetch` (`missing`: ids on it never saved). `404` without such a workspace |
| `definitions/synced` | `{ kind, items: [{ id, updatedAt }] }` | `{ cleared }`. The game took these copies: they stop waiting (a newer web save keeps waiting) |
| `catalog/replace` | `{ server, section, body }`, section one of `types`, `quest_fields`, `server`, `lists`, `vanilla` | `{}`. One section of `/chronos cl types`, at most 1.9 MB |
| `otp/create` | `{ ownerType: player\|console, ownerUuid, ownerName, validitySeconds }` | `{ code, expiresAt }`. The owner's earlier unused codes stop working; at most 15 minutes |
| `refs/replace` | `{ provider, refs: [{ kind, id, label? }] }`, provider one of `vulcan`, `tyche`, `exptailor`, `chrysos`, `kleos`, `crius`, `metabasis`, `convo`, `plutus`, `phantasos` | `{ written }`. The provider's previous ids are removed. `label` is a display name (at most 128 characters); an id that lives under another is a path (Convo: `guard/intro`, `guard/intro/accept`) |
| `status` | `{}` | `{ schema, counts: { quests, pools, refs, activeOtps, webPending, workspaces, catalogSyncedAt } }` |

### The creator: `/api/creator/...`

For a signed-in person only (the session cookie): anyone else gets `401 login required`. With `PUBLIC_API` `"true"` it opens without a code locally (writes only from `localhost`). Writes must come from the site itself (same `Origin`, JSON). Answers are `private, no-store`. Nothing here lists quests, or anyone else's workspaces.

| Call | Does |
|---|---|
| `GET /api/creator/catalog` | what `cl types` and `cl refs` sent (`{ catalog, syncedAt, refs, refLabels }`; `refLabels` holds the display names by provider, kind and id) and the pools in D1 |
| `GET /api/creator/workspaces` | your own workspaces (the ones you created): `{ workspaces: [{ name, quests, updatedAt, updatedBy }] }`, the latest first |
| `GET /api/creator/workspaces/:name` | a workspace: its quest ids, where their boxes sit; `404` for a new name |
| `GET /api/creator/quests?ids=a,b` | up to 50 quests by id, with their canvas layout; the ids not in D1 come back in `missing` |
| `GET /api/creator/quests/:id/summary` | `{ exists, name }` |
| `POST /api/creator/save` | `{ workspace?, quests: [{ id, body, layout, baseUpdatedAt }] }`: every quest is put in canonical form and checked first; one error and nothing is written (`422` with the problems). A quest or workspace saved by someone else since it was opened gives `409` with their copies. Otherwise everything is written in one transaction: quests marked `source: web` and waiting for a download |

At most 25 quests per save; a quest body up to 256 KB, its layout up to 128 KB. Canvas positions are kept in `layouts`, never in a quest's body, so moving a node never changes the quest.

**Characters (`scope`).** With ExperienceTailor characters (Chronos 1.3.0), a quest or pool has `scope: character` (the default: each character has its own progress) or `scope: account` (the player's characters share it). Like the plugin, the creator reads it trimmed in any case, writes it only when it is `account`, and reports any other value as an error. A quest in a `timed_random` pool or in an `account` pool follows its pool's scope: the inspector shows "Follows pool ...", and a different scope on the quest is warned about as ignored. Pools are made in game; their scope reaches the creator with `/chronos cl export pool all`.

### Signing in: `/api/auth/...`

| Call | Does |
|---|---|
| `POST /api/auth/otp` with `{ "code": "123456" }` | uses the code (once, before it expires) and starts a session: `{ ok, owner: { ownerType, ownerUuid, ownerName, expiresAt } }` plus the session cookie |
| `GET /api/auth/me` | who is signed in, or `401` |
| `POST /api/auth/logout` | ends the session and deletes the cookie |

- The cookie `chronos_session` is HttpOnly, SameSite=Strict, and Secure on https. It holds a random token; D1 keeps only its SHA-256 hash, so the `sessions` table cannot be used to sign in.
- Wrong codes are limited: 10 per address and 200 in total within 10 minutes. After that the answer is `429` with `retryAfter` seconds, so six digits cannot be guessed.
- A code signs in as whoever asked for it in game (the player, or the console).

## Tests

`npm test` runs the Worker's checks (signatures, request validation, codes, the creator's requests and conflicts), the quest port (every seed quest comes out exactly as the plugin stored it, and the validator's errors and warnings), the editor model (open and save unchanged, the canvas rules, the lines between quests, undo) and the site's helpers. The signature test uses the same vector as the plugin's `CloudflareTest`, so both sides are known to sign alike.
