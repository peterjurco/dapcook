'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getPromptInfo } from '@/lib/evals/prompts'
import { executeRun, getRunner } from '@/lib/evals/runners'
import { createCase, deleteCase, getCase, listCases, newId, updateCase } from '@/lib/evals/store'
import type { EvalCase, PromptId, Verdict } from '@/lib/evals/types'

// These actions write to the local filesystem and spend Anthropic credits, so
// they only exist in `next dev`, like /dev/login.
function assertDev(prompt: string): PromptId {
  if (process.env.NODE_ENV !== 'development') throw new Error('Not available')
  const info = getPromptInfo(prompt)
  if (!info?.ready) throw new Error(`Unknown prompt: ${prompt}`)
  return info.id
}

function base(prompt: PromptId) {
  return `/dev/evals/${prompt}`
}

export interface CreateCaseState {
  error?: string
}

export async function createCaseAction(
  promptParam: string,
  _prev: CreateCaseState,
  formData: FormData
): Promise<CreateCaseState> {
  const prompt = assertDev(promptParam)
  const source = Object.fromEntries(
    [...formData.entries()].filter((e): e is [string, string] => typeof e[1] === 'string')
  )

  // The same URL twice would split its runs across two cases; reuse the first.
  const url = source.url?.trim()
  const existing = url ? (await listCases(prompt)).find((c) => c.source.url === url) : undefined
  if (existing) redirect(`${base(prompt)}/${existing.id}`)

  let evalCase: EvalCase
  try {
    const prepared = await getRunner(prompt).prepare(source)
    evalCase = { id: newId(), prompt, createdAt: new Date().toISOString(), ...prepared, runs: [] }
    await createCase(evalCase)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  revalidatePath(base(prompt))
  redirect(`${base(prompt)}/${evalCase.id}`)
}

export async function runCaseAction(promptParam: string, caseId: string, times: number): Promise<void> {
  const prompt = assertDev(promptParam)
  const count = Math.min(Math.max(Math.floor(times), 1), 10)
  const evalCase = await getCase(prompt, caseId)
  if (!evalCase) throw new Error('Case not found')

  const runs = await Promise.all(Array.from({ length: count }, () => executeRun(evalCase)))
  runs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  await updateCase(prompt, caseId, (c) => { c.runs.push(...runs) })
  revalidatePath(base(prompt), 'layout')
}

export async function setVerdictAction(
  promptParam: string, caseId: string, runId: string, verdict: Verdict | null
): Promise<void> {
  const prompt = assertDev(promptParam)
  await updateCase(prompt, caseId, (c) => {
    const run = c.runs.find((r) => r.id === runId)
    if (run) run.verdict = verdict
  })
  revalidatePath(base(prompt), 'layout')
}

export async function setNotesAction(promptParam: string, caseId: string, runId: string, notes: string): Promise<void> {
  const prompt = assertDev(promptParam)
  await updateCase(prompt, caseId, (c) => {
    const run = c.runs.find((r) => r.id === runId)
    if (run) run.notes = notes
  })
  revalidatePath(base(prompt), 'layout')
}

/** Loads the page's reference answer for an input added before references existed. */
export async function loadReferenceAction(promptParam: string, caseId: string): Promise<void> {
  const prompt = assertDev(promptParam)
  const evalCase = await getCase(prompt, caseId)
  const runner = getRunner(prompt)
  if (!evalCase || !runner.loadReference) throw new Error('Nothing to load')
  const reference = await runner.loadReference(evalCase.source)
  await updateCase(prompt, caseId, (c) => { c.reference = reference })
  revalidatePath(base(prompt), 'layout')
}

export async function deleteRunAction(promptParam: string, caseId: string, runId: string): Promise<void> {
  const prompt = assertDev(promptParam)
  await updateCase(prompt, caseId, (c) => { c.runs = c.runs.filter((r) => r.id !== runId) })
  revalidatePath(base(prompt), 'layout')
}

export async function deleteCaseAction(promptParam: string, caseId: string): Promise<void> {
  const prompt = assertDev(promptParam)
  await deleteCase(prompt, caseId)
  revalidatePath(base(prompt))
  redirect(base(prompt))
}
