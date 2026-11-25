import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JUDGE_MODEL } from '@/lib/evals/judge'
import { getPromptInfo } from '@/lib/evals/prompts'
import { listCases, listSuiteResults } from '@/lib/evals/store'
import { PRODUCTION_EXTRACT_MODEL, suiteSamples, summarize } from '@/lib/evals/suite'
import { SuiteForm } from '../../_components/SuiteForm'
import { Rate } from '../../_components/Rate'

export const dynamic = 'force-dynamic'

export default async function SuitePage({ params }: { params: Promise<{ prompt: string }> }) {
  const { prompt } = await params
  const info = getPromptInfo(prompt)
  if (info?.id !== 'extract-recipe') notFound()

  const [cases, results] = await Promise.all([listCases(info.id), listSuiteResults(info.id)])
  const samples = suiteSamples(cases)

  return (
    <div>
      <Link href={`/dev/evals/${info.id}`} className="text-sm text-gray-500 hover:text-gray-900">← {info.title}</Link>
      <header className="mb-5 mt-2">
        <h1 className="text-2xl font-semibold">Eval suite</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Scores the prompt on every input with an expected output: ingredients and instruction completeness by
          code, step division by an AI judge.
        </p>
      </header>

      <SuiteForm prompt={info.id} sampleCount={samples.length} defaultModel={PRODUCTION_EXTRACT_MODEL} judgeModel={JUDGE_MODEL} />

      <h2 className="mb-2 mt-6 text-sm font-semibold">Past runs</h2>
      {results.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">No eval runs yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 font-normal">Run</th>
                <th className="px-3 py-2 font-normal">Model</th>
                <th className="px-3 py-2 font-normal">All checks</th>
                <th className="px-3 py-2 font-normal">Ingredients</th>
                <th className="px-3 py-2 font-normal">Completeness</th>
                <th className="px-3 py-2 font-normal">Division</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.map((r) => {
                const s = summarize(r)
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <Link href={`/dev/evals/${info.id}/suite/${r.id}`} className="text-emerald-700 hover:underline">
                        {new Date(r.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {r.samples.length} results{r.runsPerSample > 1 && ` (${r.runsPerSample}× per sample)`}
                        {s.errors > 0 && <span className="text-red-700"> · {s.errors} errors</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.model}</td>
                    <td className="px-3 py-2"><Rate {...s.allPassed} /></td>
                    <td className="px-3 py-2"><Rate {...s.ingredients} /></td>
                    <td className="px-3 py-2"><Rate {...s.completeness} /></td>
                    <td className="px-3 py-2"><Rate {...s.division} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
