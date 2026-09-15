import { Skeleton } from '@/components/ui/Skeleton'

export default function SettingsLoading() {
  return (
    <div className="max-w-xl mx-auto px-6 pt-6 pb-10 space-y-8" aria-hidden="true">
      <Skeleton className="h-7 w-32" />
      {Array.from({ length: 4 }, (_, section) => (
        <div key={section} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
      ))}
    </div>
  )
}
