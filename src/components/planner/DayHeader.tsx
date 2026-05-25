'use client'

interface DayHeaderProps {
  weekday: string
  day: number
  isToday: boolean
}

export function DayHeader({ weekday, day, isToday }: DayHeaderProps) {
  return (
    <div className={`text-center ${isToday ? 'text-gray-900' : 'text-gray-500'}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${isToday ? 'text-blue-600' : ''}`}>
        {weekday}
      </p>
      <p className={`text-lg font-semibold leading-tight ${isToday ? 'text-blue-600' : ''}`}>
        {day}
      </p>
    </div>
  )
}
