import { describe, it, expect } from 'vitest'
import { countRuns, filterCases, findDuplicateOutputs, parseRunFilter } from './filter'
import type { EvalCase, EvalRun } from './types'

function run(id: string, overrides: Partial<EvalRun> = {}): EvalRun {
  return {
    id, createdAt: '2026-01-01T00:00:00.000Z', request: {}, rawText: '', output: { a: id },
    durationMs: 1, verdict: null, notes: '', ...overrides,
  }
}

function evalCase(id: string, runs: EvalRun[]): EvalCase {
  return {
    id, prompt: 'extract-recipe', createdAt: '2026-01-01T00:00:00.000Z', label: id,
    source: {}, input: {}, meta: {}, runs,
  }
}

const cases = [
  evalCase('one', [run('1a', { verdict: 'correct' }), run('1b', { verdict: 'incorrect', notes: 'missed step 3' })]),
  evalCase('two', [run('2a')]),
  evalCase('empty', []),
]

describe('eval filters', () => {
  it('falls back to "all" for unknown filter values', () => {
    expect(parseRunFilter('incorrect')).toBe('incorrect')
    expect(parseRunFilter('bogus')).toBe('all')
    expect(parseRunFilter(undefined)).toBe('all')
  })

  it('keeps cases without runs only under "all"', () => {
    expect(filterCases(cases, 'all').map((r) => r.evalCase.id)).toEqual(['one', 'two', 'empty'])
    expect(filterCases(cases, 'unrated').map((r) => r.evalCase.id)).toEqual(['two'])
  })

  it('returns only matching runs, numbered by their position in the case', () => {
    const [row] = filterCases(cases, 'incorrect')
    expect(row.evalCase.id).toBe('one')
    expect(row.runs.map(({ run, number }) => [run.id, number])).toEqual([['1b', 2]])
    expect(filterCases(cases, 'notes')[0].runs[0].run.notes).toBe('missed step 3')
  })

  it('counts runs per filter', () => {
    expect(countRuns(cases)).toEqual({ all: 3, incorrect: 1, 'bad-input': 0, correct: 1, unrated: 1, notes: 1 })
  })

  it('points repeated outputs at the first run that produced them', () => {
    const c = evalCase('dup', [
      run('x', { output: { rawSteps: ['a'] } }),
      run('y', { output: { rawSteps: ['b'] } }),
      run('z', { output: { rawSteps: ['a'] } }),
      run('err', { output: null, error: 'overloaded' }),
    ])
    expect(Object.fromEntries(findDuplicateOutputs(c))).toEqual({ z: 1 })
  })
})
