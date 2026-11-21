import type { EvalCase, EvalRun } from './types'

export const RUN_FILTERS = ['all', 'incorrect', 'bad-input', 'correct', 'unrated', 'notes'] as const
export type RunFilter = (typeof RUN_FILTERS)[number]

export function parseRunFilter(value: string | string[] | undefined): RunFilter {
  return RUN_FILTERS.find((f) => f === value) ?? 'all'
}

export function runMatches(run: EvalRun, filter: RunFilter): boolean {
  switch (filter) {
    case 'all': return true
    case 'incorrect': return run.verdict === 'incorrect'
    case 'bad-input': return run.verdict === 'bad-input'
    case 'correct': return run.verdict === 'correct'
    case 'unrated': return run.verdict === null
    case 'notes': return run.notes.trim() !== ''
  }
}

export interface NumberedRun { run: EvalRun; number: number }

/** Runs numbered in the order they were made (1 = first run). */
export function numberRuns(evalCase: EvalCase): NumberedRun[] {
  return evalCase.runs.map((run, i) => ({ run, number: i + 1 }))
}

/**
 * Cases with their runs that match the filter. Under "all" a case with no runs
 * still shows (it's waiting to be run); under any other filter it's dropped.
 */
export function filterCases(cases: EvalCase[], filter: RunFilter): { evalCase: EvalCase; runs: NumberedRun[] }[] {
  return cases
    .map((evalCase) => ({ evalCase, runs: numberRuns(evalCase).filter(({ run }) => runMatches(run, filter)) }))
    .filter(({ runs }) => filter === 'all' || runs.length > 0)
}

export function countRuns(cases: EvalCase[]): Record<RunFilter, number> {
  const counts = Object.fromEntries(RUN_FILTERS.map((f) => [f, 0])) as Record<RunFilter, number>
  for (const c of cases) {
    for (const run of c.runs) {
      for (const f of RUN_FILTERS) if (runMatches(run, f)) counts[f]++
    }
  }
  return counts
}

/** For each run, the number of the earliest earlier run with the same output, if any. */
export function findDuplicateOutputs(evalCase: EvalCase): Map<string, number> {
  const firstByOutput = new Map<string, number>()
  const duplicates = new Map<string, number>()
  numberRuns(evalCase).forEach(({ run, number }) => {
    if (run.error) return
    const key = run.output !== null ? JSON.stringify(run.output) : `raw:${run.rawText}`
    const first = firstByOutput.get(key)
    if (first === undefined) firstByOutput.set(key, number)
    else duplicates.set(run.id, first)
  })
  return duplicates
}
