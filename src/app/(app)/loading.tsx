import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Fallback for app routes without a shape-specific skeleton. The nav shell has
 * already rendered by this point, so this only stands in for the page body.
 */
export default function AppLoading() {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-6 pb-10 space-y-4" aria-hidden="true">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-full max-w-md" />
      <div className="flex flex-col gap-3 pt-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
