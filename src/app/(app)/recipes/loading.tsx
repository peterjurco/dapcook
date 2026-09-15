import { Skeleton } from '@/components/ui/Skeleton'
import { RECIPE_GRID_CLASSES } from '@/components/recipe/gridClasses'

/** Placeholder count: enough to cover the fold at the widest (4-column) layout. */
const CARDS = 12

export default function RecipesLoading() {
  return (
    <div className="p-6 lg:p-8" aria-hidden="true">
      {/* Search field + new/import actions */}
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-10 flex-1 max-w-md rounded-lg" />
        <Skeleton className="h-10 w-10 rounded-lg sm:w-28" />
      </div>

      {/* Tag filter row */}
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-full hidden sm:block" />
        <Skeleton className="h-8 w-16 rounded-full hidden sm:block" />
      </div>

      <div className={RECIPE_GRID_CLASSES} data-testid="recipe-grid-skeleton">
        {Array.from({ length: CARDS }, (_, i) => (
          <div
            key={i}
            data-testid="recipe-card-skeleton"
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            <Skeleton className="aspect-[4/3] rounded-none" />
            <div className="p-4 flex flex-col gap-2">
              <Skeleton className="h-5 w-3/4" />
              <div className="flex gap-1.5">
                <Skeleton className="h-4 w-14 rounded-full" />
                <Skeleton className="h-4 w-10 rounded-full" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
