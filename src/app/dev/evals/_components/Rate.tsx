import { cn } from '@/lib/utils/cn'

/** "8/10 · 80%", coloured by how close to all-pass it is. */
export function Rate({ passed, of, className }: { passed: number; of: number; className?: string }) {
  if (of === 0) return <span className={cn('text-gray-500', className)}>–</span>
  const pct = Math.round((100 * passed) / of)
  return (
    <span className={cn('whitespace-nowrap', pct === 100 ? 'text-emerald-700' : pct >= 70 ? 'text-amber-700' : 'text-red-700', className)}>
      <span className="font-semibold">{passed}/{of}</span> <span className="text-xs opacity-80">{pct}%</span>
    </span>
  )
}

/** ✓ / ✗ / – for one check of one sample. */
export function Check({ status }: { status: 'pass' | 'fail' | 'skipped' | 'error' }) {
  const look = {
    pass: ['✓', 'text-emerald-700', 'Passed'],
    fail: ['✗', 'text-red-700', 'Failed'],
    skipped: ['–', 'text-gray-500', 'Not judged: instruction completeness failed'],
    error: ['!', 'text-amber-700', 'Error'],
  }[status]
  return <span title={look[2]} className={cn('font-semibold', look[1])}>{look[0]}</span>
}
