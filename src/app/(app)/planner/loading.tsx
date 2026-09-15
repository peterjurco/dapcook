import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Covers the server render — which resolves which week to show — so the week
 * grid appears in place rather than after a blank pause. Mirrors the in-client
 * skeleton `PlannerClient` shows while it loads a different week.
 */
export default function PlannerLoading() {
  return (
    <div className="px-6 pt-6 pb-8 max-w-6xl mx-auto" aria-hidden="true">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      <div className="hidden md:grid grid-cols-7 gap-3 mb-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="text-center">
            <Skeleton className="h-4 w-8 mb-2 mx-auto" />
            <Skeleton className="h-6 w-6 mb-2 mx-auto" />
          </div>
        ))}
      </div>
      <div className="hidden md:grid grid-cols-7 gap-3">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>

      <div className="md:hidden grid grid-cols-1 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-16 mb-1.5" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}
