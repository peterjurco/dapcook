import { cn } from '@/lib/utils/cn'
import type { Verdict } from '@/lib/evals/types'

export const VERDICTS: { value: Verdict; label: string; hint: string }[] = [
  { value: 'correct', label: '✓ Correct', hint: 'The output matches the input' },
  { value: 'incorrect', label: '✗ Incorrect', hint: 'The input had it, the model missed or mangled it' },
]

const STYLES: Record<Verdict | 'none', string> = {
  correct: 'bg-emerald-100 text-emerald-800',
  incorrect: 'bg-red-100 text-red-800',
  none: 'bg-gray-100 text-gray-600',
}

export function VerdictBadge({ verdict, className }: { verdict: Verdict | null; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', STYLES[verdict ?? 'none'], className)}>
      {VERDICTS.find((v) => v.value === verdict)?.label ?? 'Unrated'}
    </span>
  )
}
