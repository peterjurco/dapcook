'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  getWeekStart,
  nextWeekStart,
  prevWeekStart,
  getWeekDays,
  formatWeekLabel,
  formatDayLabel,
  toDateString,
  isCurrentWeek,
  isNextWeek,
  dayOfWeekNumber,
} from '@/lib/utils/week'
import { addSlotToCachedWeek, removeSlotFromCachedWeek } from '@/components/planner/plannerWeekCache'
import type { MealSlotWithRecipe } from '@/types/planner'

const LAST_WEEK_KEY = 'addToPlan:lastWeek'

interface AddToPlanPickerProps {
  recipeId: string
  onClose: () => void
}

export function AddToPlanPicker({ recipeId, onClose }: AddToPlanPickerProps) {
  const router = useRouter()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const thisWeek = getWeekStart(today)

  const [weekStart, setWeekStart] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem(LAST_WEEK_KEY)
      if (saved) {
        const parsed = getWeekStart(new Date(saved))
        if (parsed.getTime() >= thisWeek.getTime()) return parsed
      }
    } catch {
      // ignore storage errors
    }
    return thisWeek
  })
  const [selectedDay, setSelectedDay] = useState<number>(() =>
    isCurrentWeek(weekStart) ? dayOfWeekNumber(today) : 1,
  )
  const [submitting, setSubmitting] = useState(false)
  const [confirmedDay, setConfirmedDay] = useState<number | null>(null)
  // The slot created earlier in this picker session (set after the first add).
  // "Change" re-uses it so a second confirm MOVES the meal instead of duplicating it.
  const [placed, setPlaced] = useState<{ id: string; weekStart: string } | null>(null)

  const weekDays = getWeekDays(weekStart)
  const todayStr = toDateString(today)

  function changeWeek(next: Date) {
    setWeekStart(next)
    setSelectedDay(isCurrentWeek(next) ? dayOfWeekNumber(today) : 1)
  }

  function weekDescriptor(w: Date): string {
    if (isCurrentWeek(w)) return 'this week'
    if (isNextWeek(w)) return 'next week'
    return formatWeekLabel(w)
  }

  async function handleAdd() {
    setSubmitting(true)
    const targetWeek = toDateString(weekStart)
    // If this session already placed the meal (user hit "Change"), remove that
    // placement first so we end up with a single slot at the new destination.
    if (placed) {
      await fetch(`/api/planner/slots/${placed.id}`, { method: 'DELETE' })
      removeSlotFromCachedWeek(placed.weekStart, placed.id)
    }
    const res = await fetch('/api/planner/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        week_start: targetWeek,
        day_of_week: selectedDay,
        recipe_id: recipeId,
      }),
    })
    setSubmitting(false)
    if (res.ok) {
      try {
        const slot = (await res.json()) as MealSlotWithRecipe & { id?: string }
        if (slot?.id) {
          // Keep the planner's in-memory cache in sync so "View plan" shows the
          // meal immediately instead of stale data pending the silent refetch.
          addSlotToCachedWeek(targetWeek, slot)
          setPlaced({ id: slot.id, weekStart: targetWeek })
        }
      } catch {
        // ignore body parse errors — placement still succeeded
      }
      try {
        localStorage.setItem(LAST_WEEK_KEY, targetWeek)
      } catch {
        // ignore storage errors
      }
      setConfirmedDay(selectedDay)
    }
  }

  if (confirmedDay != null) {
    const { weekday, day } = formatDayLabel(weekDays[confirmedDay - 1])
    return (
      <div className="w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <Check size={16} className="text-green-600 flex-shrink-0" />
          <span>Added to {weekday} {day} · {weekDescriptor(weekStart)}</span>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmedDay(null)}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => {
              router.push(`/planner?week=${toDateString(weekStart)}`)
              onClose()
            }}
            className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            View plan
          </button>
        </div>
      </div>
    )
  }

  const selectedLabel = formatDayLabel(weekDays[selectedDay - 1])

  return (
    <div className="w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
      <p className="mb-3 text-sm font-semibold text-gray-900">Add to plan</p>

      {/* Quick week chips */}
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => changeWeek(thisWeek)}
          aria-pressed={isCurrentWeek(weekStart)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            isCurrentWeek(weekStart) ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          This week
        </button>
        <button
          type="button"
          onClick={() => changeWeek(nextWeekStart(thisWeek))}
          aria-pressed={isNextWeek(weekStart)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            isNextWeek(weekStart) ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          Next week
        </button>
      </div>

      {/* Week pager */}
      <div className="mb-3 flex items-center justify-between rounded-lg border border-gray-200 px-2 py-1.5">
        <button
          type="button"
          onClick={() => changeWeek(prevWeekStart(weekStart))}
          disabled={isCurrentWeek(weekStart)}
          aria-label="Earlier week"
          className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-semibold text-gray-900">{formatWeekLabel(weekStart)}</span>
        <button
          type="button"
          onClick={() => changeWeek(nextWeekStart(weekStart))}
          aria-label="Later week"
          className="text-gray-400 hover:text-gray-700"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day grid */}
      <div className="mb-4 grid grid-cols-7 gap-1.5">
        {weekDays.map((date, i) => {
          const d = i + 1
          const { weekday, day } = formatDayLabel(date)
          const isSelected = selectedDay === d
          const isToday = toDateString(date) === todayStr
          return (
            <button
              key={d}
              type="button"
              onClick={() => setSelectedDay(d)}
              aria-pressed={isSelected}
              className={`flex flex-col items-center rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                isSelected
                  ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-400'
                  : isToday
                  ? 'text-gray-700 ring-1 ring-inset ring-blue-300 hover:bg-gray-50'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className="text-[9px] font-medium text-gray-400">{weekday}</span>
              {day}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        disabled={submitting}
        className="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
      >
        {submitting ? 'Adding…' : `Add to ${selectedLabel.weekday} ${selectedLabel.day}`}
      </button>
    </div>
  )
}
