import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { randomBytes } from 'crypto'
import path from 'path'
import { AUTO_PROBLEM_PREFIX, detectInputProblem } from './coverage'
import type { EvalCase, PromptId, SuiteResult } from './types'

// One pretty-printed JSON file per case: evals/data/<prompt>/<caseId>.json.
// Plain files keep the dataset diffable and easy to feed into an eval runner.
export function dataDir(): string {
  return process.env.EVALS_DATA_DIR ?? path.join(process.cwd(), 'evals', 'data')
}

/**
 * Raw HTML of every page the eval tool fetched, next to the data folder, for
 * scripts/check-recipe-pages.ts. Git-ignored: it's third-party content.
 */
export function pagesDir(): string {
  return path.join(path.dirname(dataDir()), 'pages')
}

/** "https://www.example.com/recipes/pesto-risotto/" → "example.com-recipes-pesto-risotto.html" */
export function pageFileName(url: string): string {
  const { hostname, pathname } = new URL(url)
  const slug = `${hostname.replace(/^www\./, '')}${pathname}`
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
  return `${slug}.html`
}

/** Keeps the latest fetch of a page. Never fails the caller: the copy is a convenience. */
export async function savePageHtml(url: string, html: string): Promise<void> {
  try {
    await mkdir(pagesDir(), { recursive: true })
    await writeFile(path.join(pagesDir(), pageFileName(url)), html, 'utf8')
  } catch (err) {
    console.error(`[evals] Could not save the page HTML for ${url}:`, err)
  }
}

const SAFE_ID = /^[a-z0-9-]+$/

/**
 * Early files marked bad inputs per run (verdict "bad-input"). It's a property
 * of the input, so move it there.
 */
function migrate(evalCase: EvalCase): EvalCase {
  const legacy = evalCase.runs.filter((r) => (r.verdict as string) === 'bad-input')
  if (legacy.length > 0) {
    evalCase.inputProblem ||=
      detectInputProblem(String(evalCase.input.articleText ?? ''), evalCase.reference) ||
      legacy.map((r) => r.notes.trim()).find(Boolean) ||
      'Marked as bad input on a run.'
    for (const run of legacy) run.verdict = null
  }
  // Re-run the automatic input check on inputs it flagged, so a fix to the
  // check (e.g. tolerating "c." vs "cup") clears its false alarms. Problems
  // entered by hand are left alone.
  if (evalCase.inputProblem?.startsWith(AUTO_PROBLEM_PREFIX)) {
    evalCase.inputProblem = detectInputProblem(String(evalCase.input.articleText ?? ''), evalCase.reference)
  }
  return evalCase
}

function parseCase(json: string): EvalCase {
  return migrate(JSON.parse(json) as EvalCase)
}

function casePath(prompt: PromptId, caseId: string): string {
  if (!SAFE_ID.test(prompt) || !SAFE_ID.test(caseId)) throw new Error(`Invalid id: ${prompt}/${caseId}`)
  return path.join(dataDir(), prompt, `${caseId}.json`)
}

/** Time-ordered, URL-safe id: newer ids sort after older ones. */
export function newId(): string {
  return `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
}

export async function listCases(prompt: PromptId): Promise<EvalCase[]> {
  const dir = path.join(dataDir(), prompt)
  let files: string[]
  try {
    files = await readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const cases = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => parseCase(await readFile(path.join(dir, f), 'utf8')))
  )
  return cases.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getCase(prompt: PromptId, caseId: string): Promise<EvalCase | null> {
  try {
    return parseCase(await readFile(casePath(prompt, caseId), 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

async function writeCase(evalCase: EvalCase): Promise<void> {
  const file = casePath(evalCase.prompt, evalCase.id)
  await mkdir(path.dirname(file), { recursive: true })
  // Write-then-rename so a crash never leaves a half-written case behind.
  const tmp = `${file}.${randomBytes(3).toString('hex')}.tmp`
  await writeFile(tmp, JSON.stringify(evalCase, null, 2) + '\n', 'utf8')
  await rename(tmp, file)
}

export async function createCase(evalCase: EvalCase): Promise<void> {
  await writeCase(evalCase)
}

// Serialise read-modify-write per file, so two quick edits (e.g. a verdict
// click while a run is being appended) can't overwrite each other.
const locks = new Map<string, Promise<unknown>>()

export async function updateCase(
  prompt: PromptId,
  caseId: string,
  mutate: (evalCase: EvalCase) => void
): Promise<EvalCase> {
  const key = casePath(prompt, caseId)
  const previous = locks.get(key) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(async () => {
    const evalCase = await getCase(prompt, caseId)
    if (!evalCase) throw new Error(`Case not found: ${prompt}/${caseId}`)
    mutate(evalCase)
    await writeCase(evalCase)
    return evalCase
  })
  locks.set(key, next)
  try {
    return await next
  } finally {
    if (locks.get(key) === next) locks.delete(key)
  }
}

// ── Eval suite results: evals/results/<prompt>/<id>.json, git-ignored ──────

function resultsDir(prompt: PromptId): string {
  return path.join(path.dirname(dataDir()), 'results', prompt)
}

export async function saveSuiteResult(result: SuiteResult): Promise<void> {
  const dir = resultsDir(result.prompt)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, `${result.id}.json`), JSON.stringify(result, null, 2) + '\n', 'utf8')
}

/** Newest first. */
export async function listSuiteResults(prompt: PromptId): Promise<SuiteResult[]> {
  const dir = resultsDir(prompt)
  let files: string[]
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const results = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), 'utf8')) as SuiteResult))
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getSuiteResult(prompt: PromptId, id: string): Promise<SuiteResult | null> {
  if (!SAFE_ID.test(id)) throw new Error(`Invalid id: ${id}`)
  try {
    return JSON.parse(await readFile(path.join(resultsDir(prompt), `${id}.json`), 'utf8')) as SuiteResult
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function deleteCase(prompt: PromptId, caseId: string): Promise<void> {
  await rm(casePath(prompt, caseId), { force: true })
}
