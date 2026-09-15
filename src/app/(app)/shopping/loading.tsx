import { Skeleton } from '@/components/ui/Skeleton'

export default function ShoppingLoading() {
  return (
    <div className="max-w-xl mx-auto px-0 sm:px-6 pt-6 pb-10" aria-hidden="true">
      <div className="flex items-center justify-between mb-1 px-4 sm:px-0">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-3 w-48 mb-4 mx-4 sm:mx-0" />

      <div className="flex flex-col gap-5 px-4 sm:px-0">
        {Array.from({ length: 4 }, (_, section) => (
          <div key={section} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            {Array.from({ length: 4 }, (_, row) => (
              <div key={row} className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 flex-1 max-w-[70%]" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
