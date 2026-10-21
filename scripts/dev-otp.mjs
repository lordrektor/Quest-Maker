// A sign-in code for local development (`npm run dev:otp`): written to the LOCAL D1 only, never to Cloudflare.
// On a real server the codes come from `/chronos cl otp` in game.
import { execSync } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
const now = Date.now()
const minutes = 10
const sql = `UPDATE otps SET used_at = ${now} WHERE owner_key = 'console' AND used_at IS NULL;
INSERT INTO otps (code, owner_key, owner_type, owner_uuid, owner_name, created_at, expires_at)
VALUES ('${code}', 'console', 'console', NULL, 'local tester', ${now}, ${now + minutes * 60_000});
`

const dir = mkdtempSync(join(tmpdir(), 'chronos-otp-'))
const file = join(dir, 'otp.sql')
try {
  writeFileSync(file, sql)
  // One command line (npx is a .cmd on Windows); only our own temporary path goes into it
  execSync(`npx wrangler d1 execute chronos --local --file="${file}"`, { stdio: 'pipe' })
} catch (e) {
  console.error('Could not write the code to the local D1. Run `npm run db:migrate:local` first.')
  console.error(String(e.stderr ?? e.message))
  process.exit(1)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`Local sign-in code: ${code.slice(0, 3)} ${code.slice(3)}  (works once, for ${minutes} minutes, on npm run dev:local)`)
