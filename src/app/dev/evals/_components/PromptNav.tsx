'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import type { PromptInfo } from '@/lib/evals/prompts'

export function PromptNav({ prompts }: { prompts: Pick<PromptInfo, 'id' | 'title' | 'ready'>[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Prompts" className="flex gap-1 overflow-x-auto md:flex-col">
      {prompts.map((p) => {
        const href = `/dev/evals/${p.id}`
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={p.id}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-sm',
              active ? 'bg-emerald-50 font-medium text-emerald-800' : 'text-gray-700 hover:bg-gray-100',
              !p.ready && !active && 'text-gray-500'
            )}
          >
            {p.title}
            {!p.ready && <span className="text-[10px] uppercase tracking-wide text-gray-500">soon</span>}
          </Link>
        )
      })}
    </nav>
  )
}
