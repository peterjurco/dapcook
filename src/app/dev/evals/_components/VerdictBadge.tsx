import { cn } from '@/lib/utils/cn'
import type { Verdict } from '@/lib/evals/types'

export function VerdictBadge({ verdict, className }: { verdict: Verdict | null; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        verdict === 'correct' && 'bg-emerald-100 text-emerald-800',
        verdict === 'incorrect' && 'bg-red-100 text-red-800',
        verdict === null && 'bg-gray-100 text-gray-600',
        className
      )}
    >
      {verdict === 'correct' ? '✓ Correct' : verdict === 'incorrect' ? '✗ Incorrect' : 'Unrated'}
    </span>
  )
}
