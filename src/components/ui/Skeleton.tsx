import { cn } from '@/lib/utils/cn'

/**
 * A placeholder block for route loading states.
 *
 * Purely decorative: the containing skeleton is marked `aria-hidden`, so these
 * are never announced. The pulse is dropped for anyone who asked for reduced
 * motion.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse motion-reduce:animate-none rounded bg-gray-100', className)} />
  )
}
