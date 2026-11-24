// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { createCase, deleteCase, getCase, listCases, newId, updateCase } from './store'
import type { EvalCase, EvalRun } from './types'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'evals-'))
  process.env.EVALS_DATA_DIR = dir
})

afterEach(async () => {
  delete process.env.EVALS_DATA_DIR
  await rm(dir, { recursive: true, force: true })
})

function makeCase(overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    id: newId(),
    prompt: 'extract-recipe',
    createdAt: new Date().toISOString(),
    label: 'Pie',
    source: { url: 'https://example.com/pie' },
    input: { articleText: 'text' },
    meta: {},
    runs: [],
    ...overrides,
  }
}

function makeRun(id: string): EvalRun {
  return {
    id, createdAt: new Date().toISOString(), request: {}, rawText: '{}', output: {},
    durationMs: 1, verdict: null, notes: '',
  }
}

describe('eval store', () => {
  it('returns an empty list before anything is saved', async () => {
    expect(await listCases('extract-recipe')).toEqual([])
  })

  it('round-trips a case and lists newest first', async () => {
    const older = makeCase({ createdAt: '2026-01-01T00:00:00.000Z', label: 'old' })
    const newer = makeCase({ createdAt: '2026-02-01T00:00:00.000Z', label: 'new' })
    await createCase(older)
    await createCase(newer)

    expect(await getCase('extract-recipe', older.id)).toEqual(older)
    expect((await listCases('extract-recipe')).map((c) => c.label)).toEqual(['new', 'old'])
  })

  it('keeps every update when several land at once', async () => {
    const c = makeCase()
    await createCase(c)

    await Promise.all(
      ['a', 'b', 'c', 'd'].map((id) => updateCase('extract-recipe', c.id, (ec) => { ec.runs.push(makeRun(id)) }))
    )

    const saved = await getCase('extract-recipe', c.id)
    expect(saved?.runs.map((r) => r.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    // No temp files left behind by the write-then-rename.
    expect(await readdir(path.join(dir, 'extract-recipe'))).toEqual([`${c.id}.json`])
  })

  it('moves an old run-level "bad-input" verdict onto the case', async () => {
    const c = makeCase({ runs: [{ ...makeRun('r1'), verdict: 'bad-input' as never, notes: 'no ingredients' }] })
    await createCase(c)
    const saved = await getCase('extract-recipe', c.id)
    expect(saved?.inputProblem).toBe('no ingredients')
    expect(saved?.runs[0].verdict).toBeNull()
  })

  it('re-checks inputs the automatic check flagged, but not ones flagged by hand', async () => {
    const reference = { source: 'JSON-LD', data: { rawIngredients: ['3/4 c. chicken broth'], rawSteps: ['Simmer the broth.'] } }
    const input = { articleText: '3/4 cup chicken broth\nSimmer the broth.' }
    const auto = makeCase({ input, reference, inputProblem: "The article text is missing 1 of 1 ingredients from the page's JSON-LD." })
    const manual = makeCase({ input, reference, inputProblem: 'Ingredients are an image' })
    await createCase(auto)
    await createCase(manual)
    expect((await getCase('extract-recipe', auto.id))?.inputProblem).toBeNull()
    expect((await getCase('extract-recipe', manual.id))?.inputProblem).toBe('Ingredients are an image')
  })

  it('deletes a case', async () => {
    const c = makeCase()
    await createCase(c)
    await deleteCase('extract-recipe', c.id)
    expect(await getCase('extract-recipe', c.id)).toBeNull()
  })

  it('rejects ids that could escape the data directory', async () => {
    await expect(getCase('extract-recipe', '../../etc/passwd')).rejects.toThrow('Invalid id')
  })
})
