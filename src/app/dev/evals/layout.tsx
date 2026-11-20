import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PROMPTS } from '@/lib/evals/prompts'
import { PromptNav } from './_components/PromptNav'

export const metadata: Metadata = { title: 'Evals · dapcook', robots: { index: false } }

/**
 * Local-only tool for building AI eval datasets: run a production prompt on an
 * input, record every output and judge it. Data lives in evals/data/.
 */
export default function EvalsLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== 'development') notFound()

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
        <aside className="md:w-60 md:shrink-0">
          <Link href="/dev/evals" className="mb-4 block px-3 text-lg font-semibold">
            dapcook <span className="text-emerald-700">evals</span>
          </Link>
          <PromptNav prompts={PROMPTS.map(({ id, title, ready }) => ({ id, title, ready }))} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
