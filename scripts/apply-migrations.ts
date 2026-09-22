/**
 * Applies pending `supabase/migrations/*.sql` to a database, in filename order.
 *
 * Staging's schema has to keep up with main automatically, or testing against
 * it is worthless — code syncs on every push, so the schema has to as well.
 * Production stays hand-applied on purpose.
 *
 * Which migrations have run is recorded in a `schema_migrations` table this
 * script creates. The first run against a database that already has a schema
 * (the one built by hand before any of this existed) seeds that table from
 * `supabase/baseline.txt` instead of re-running those files. A genuinely empty
 * database gets every migration applied from scratch.
 *
 * Each file runs in its own transaction and the script stops at the first
 * failure, so a broken migration leaves the ones after it unapplied.
 *
 *   DATABASE_URL=postgres://... node scripts/apply-migrations.ts
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Resolved from the running script rather than the working directory, and
 * lazily, so importing this file for its pure helpers reads nothing.
 */
function repoPath(relative: string): string {
  return resolve(dirname(process.argv[1]), '..', relative)
}

/** Migration filenames listed in `supabase/baseline.txt`, ignoring blanks and `#` comments. */
export function parseBaseline(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

/**
 * Builds the ledger and locks it down in the same breath. RLS with no policies
 * denies anon and authenticated outright — postgres (this script) and
 * service_role bypass it — and the revoke takes back the grants Supabase hands
 * every new table in `public` by default. Without both, anyone holding the
 * public anon key can empty the ledger, and the next run then re-applies every
 * migration over a schema that already has them.
 */
export const LEDGER_STATEMENTS = [
  'create table public.schema_migrations (version text primary key, applied_at timestamptz not null default now())',
  'alter table public.schema_migrations enable row level security',
  'revoke all on public.schema_migrations from anon, authenticated',
]

/**
 * Migrations present on disk that the database has not recorded yet, sorted by
 * filename so they apply in the order they were written. Applied versions whose
 * file no longer exists are ignored rather than treated as an error — a deleted
 * migration is still applied, and nothing can be done about it from here.
 */
export function pendingMigrations(files: string[], applied: string[]): string[] {
  const done = new Set(applied)
  return files
    .filter((file) => file.endsWith('.sql') && !done.has(file))
    .sort((a, b) => a.localeCompare(b))
}

function psql(databaseUrl: string, args: string[]): string {
  return execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    // Without this an unreachable host hangs until the CI job times out hours
    // later. Supabase's direct connection is IPv6-only and GitHub runners have
    // no IPv6, so that mistake has to fail fast and say so.
    env: { ...process.env, PGCONNECT_TIMEOUT: '15' },
  })
}

/** Runs a query and returns its single scalar result. */
function scalar(databaseUrl: string, sql: string): string {
  return psql(databaseUrl, ['-t', '-A', '-c', sql]).trim()
}

function main() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error(
      'Missing DATABASE_URL (the target database connection string).\n' +
        'In CI this comes from the STAGING_DATABASE_URL repository secret —\n' +
        'add it under Settings → Secrets and variables → Actions.'
    )
    process.exit(1)
  }

  const migrationsDir = repoPath('supabase/migrations')
  const baselineFile = repoPath('supabase/baseline.txt')

  let ledgerExists: string
  try {
    ledgerExists = scalar(databaseUrl, "select to_regclass('public.schema_migrations') is not null")
  } catch {
    console.error(
      '\nCould not connect to the database.\n' +
        "If the host is db.<project-ref>.supabase.co it is IPv6-only and CI cannot reach it —\n" +
        'use the Session pooler string instead (aws-0-<region>.pooler.supabase.com, port 5432).'
    )
    process.exit(1)
  }

  if (ledgerExists !== 't') {
    for (const statement of LEDGER_STATEMENTS) {
      psql(databaseUrl, ['-c', statement])
    }

    // `recipes` comes from the very first migration: if it is already there,
    // this database predates the ledger and its baseline is applied.
    const alreadyBuilt = scalar(databaseUrl, "select to_regclass('public.recipes') is not null") === 't'

    if (alreadyBuilt && existsSync(baselineFile)) {
      const baseline = parseBaseline(readFileSync(baselineFile, 'utf8'))
      console.log(`Existing schema found — recording ${baseline.length} baseline migrations as applied.`)
      for (const version of baseline) {
        psql(databaseUrl, [
          '-c',
          `insert into public.schema_migrations (version) values ('${version}') on conflict do nothing`,
        ])
      }
    }
  }

  const applied = scalar(databaseUrl, 'select version from public.schema_migrations')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const pending = pendingMigrations(readdirSync(migrationsDir), applied)

  if (pending.length === 0) {
    console.log('No pending migrations.')
    return
  }

  console.log(`Applying ${pending.length} migration(s): ${pending.join(', ')}`)

  for (const version of pending) {
    console.log(`→ ${version}`)
    try {
      psql(databaseUrl, ['-1', '-f', `${migrationsDir}/${version}`])
    } catch {
      // psql has already written the SQL error to stderr; a stack trace from
      // here would only bury it.
      console.error(`\n${version} failed. It was rolled back and not recorded.`)
      const skipped = pending.slice(pending.indexOf(version) + 1)
      if (skipped.length > 0) console.error(`Not attempted: ${skipped.join(', ')}`)
      process.exit(1)
    }
    psql(databaseUrl, [
      '-c',
      `insert into public.schema_migrations (version) values ('${version}')`,
    ])
  }

  console.log(`Applied ${pending.length} migration(s).`)
}

// Importing this file for its pure helpers (the tests) must not touch a database.
if (process.argv[1]?.endsWith('apply-migrations.ts')) {
  main()
}
