import { mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { randomBytes } from 'crypto'
import path from 'path'
import { detectInputProblem } from './coverage'
import type { EvalCase, PromptId } from './types'

// One pretty-printed JSON file per case: evals/data/<prompt>/<caseId>.json.
// Plain files keep the dataset diffable and easy to feed into an eval runner.
export function dataDir(): string {
  return process.env.EVALS_DATA_DIR ?? path.join(process.cwd(), 'evals', 'data')
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

export async function deleteCase(prompt: PromptId, caseId: string): Promise<void> {
  await rm(casePath(prompt, caseId), { force: true })
}
