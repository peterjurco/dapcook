import { execFileSync } from 'node:child_process'

export const APP_PORT = 3001
export const FAKE_ANTHROPIC_PORT = 3011
export const APP_URL = `http://localhost:${APP_PORT}`

export interface LocalSupabase {
  url: string
  anonKey: string
  serviceRoleKey: string
}

/**
 * Connection details of the local e2e Supabase (`npm run e2e:db:start`).
 *
 * Read from `supabase status` once and cached in process.env, so Playwright's
 * workers (which inherit the env and re-load the config) don't shell out again.
 */
export function localSupabase(): LocalSupabase {
  if (!process.env.E2E_SUPABASE_URL) {
    let raw: string
    try {
      raw = execFileSync('npx', ['supabase', 'status', '--workdir', 'e2e', '-o', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      throw new Error(
        'The local e2e Supabase is not running. Start it with `npm run e2e:db:start` (needs Docker).'
      )
    }
    // The CLI can print warnings before the JSON object.
    const status = JSON.parse(raw.slice(raw.indexOf('{'))) as Record<string, string>
    process.env.E2E_SUPABASE_URL = status.API_URL
    process.env.E2E_SUPABASE_ANON_KEY = status.ANON_KEY ?? status.PUBLISHABLE_KEY
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY
  }
  return {
    url: process.env.E2E_SUPABASE_URL!,
    anonKey: process.env.E2E_SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
  }
}
