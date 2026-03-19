import { parseWeekParam } from '@/lib/utils/week'
import { PlannerClient } from '@/components/planner/PlannerClient'

interface PlannerPageProps {
  searchParams: { week?: string }
}

export default function PlannerPage({ searchParams }: PlannerPageProps) {
  const weekStart = parseWeekParam(searchParams.week)

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Weekly Planner</h1>
        <p className="text-sm text-gray-500 mt-1">Plan your lunches for the week</p>
      </div>

      <PlannerClient weekStart={weekStart} />
    </div>
  )
}
