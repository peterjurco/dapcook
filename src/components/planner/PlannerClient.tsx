'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart } from 'lucide-react'
import { DndContext, DragEndEvent, DragOverlay, pointerWithin } from '@dnd-kit/core'
import { DayHeader } from './DayHeader'
import { DaySlot } from './DaySlot'
import { SlotCard } from './SlotCard'
import { CustomLabelCard } from './CustomLabelCard'
import { WeekNav } from './WeekNav'
import { WeekRulesPanel } from './WeekRulesPanel'
import {
  getWeekDays,
  formatDayLabel,
  toDateString,
} from '@/lib/utils/week'
import type { MealSlotWithRecipe, WeekData } from '@/types/planner'
import type { Recipe, WeekPlan, WeekPlanRule } from '@/types/database'

interface PlannerClientProps {
  weekStart: Date
}

export function PlannerClient({ weekStart }: PlannerClientProps) {
  const router = useRouter()
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null)
  const [slots, setSlots] = useState<MealSlotWithRecipe[]>([])
  const [weekRules, setWeekRules] = useState<WeekPlanRule[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSlot, setActiveSlot] = useState<MealSlotWithRecipe | null>(null)
  const [openSearchDay, setOpenSearchDay] = useState<number | null>(null)
  const [isGeneratingList, setIsGeneratingList] = useState(false)

  const weekStartStr = toDateString(weekStart)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const loadWeek = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/planner/week?week=${weekStartStr}`)
    if (res.ok) {
      const data = await res.json() as WeekData
      setWeekPlan(data.weekPlan)
      setSlots(data.slots)
      setWeekRules(data.weekRules)
    }
    setLoading(false)
  }, [weekStartStr])

  useEffect(() => {
    loadWeek()
  }, [loadWeek])

  // Build slot map and coverage map
  const slotByDay = new Map<number, MealSlotWithRecipe>()
  const coveredBySlot = new Map<number, MealSlotWithRecipe>()

  for (const slot of slots) {
    slotByDay.set(slot.day_of_week, slot)
    for (let i = 1; i < slot.span_days; i++) {
      coveredBySlot.set(slot.day_of_week + i, slot)
    }
  }

  async function handleAddRecipe(dayOfWeek: number, recipe: Recipe) {
    const res = await fetch('/api/planner/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: weekStartStr, day_of_week: dayOfWeek, recipe_id: recipe.id }),
    })
    if (res.ok) {
      const slot = await res.json() as MealSlotWithRecipe
      setSlots((prev) => [...prev, slot])
      if (!weekPlan) loadWeek() // refresh to get weekPlan
    }
  }

  async function handleAddCustom(dayOfWeek: number, label: string) {
    const res = await fetch('/api/planner/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: weekStartStr, day_of_week: dayOfWeek, custom_label: label }),
    })
    if (res.ok) {
      const slot = await res.json() as MealSlotWithRecipe
      setSlots((prev) => [...prev, slot])
      if (!weekPlan) loadWeek()
    }
  }

  async function handleDelete(slotId: string) {
    setSlots((prev) => prev.filter((s) => s.id !== slotId))
    await fetch(`/api/planner/slots/${slotId}`, { method: 'DELETE' })
  }

  // Called on every column boundary crossed during resize drag — no API call
  function handleSpanPreview(slotId: string, newSpan: number) {
    setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, span_days: newSpan } : s))
  }

  // Called once on mouseup — persists the final span
  async function handleSpanCommit(slotId: string, newSpan: number) {
    await fetch(`/api/planner/slots/${slotId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ span_days: newSpan }),
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveSlot(null)
    const { active, over } = event
    if (!over) return

    const draggedSlot = active.data.current?.slot as MealSlotWithRecipe | undefined
    const targetDay = over.data.current?.dayOfWeek as number | undefined

    if (!draggedSlot || !targetDay || draggedSlot.day_of_week === targetDay) return

    const sourceDay = draggedSlot.day_of_week
    const span = draggedSlot.span_days
    const movingRight = targetDay > sourceDay

    // Build new day assignments: insert A at target, shift displaced slots by span.
    // With span=1 this is equivalent to shifting by 1 (original behaviour).
    const dayUpdates = new Map<string, number>()
    dayUpdates.set(draggedSlot.id, targetDay)

    if (movingRight) {
      // Slots whose start day falls in [sourceDay+span, targetDay+span-1] shift left by span
      for (let day = sourceDay + span; day <= targetDay + span - 1; day++) {
        const slot = slotByDay.get(day)
        if (slot) dayUpdates.set(slot.id, day - span)
      }
    } else {
      // Slots whose start day falls in [targetDay, sourceDay-1] shift right by span
      for (let day = targetDay; day < sourceDay; day++) {
        const slot = slotByDay.get(day)
        if (slot) dayUpdates.set(slot.id, day + span)
      }
    }

    const originalDays = new Map(slots.map((s) => [s.id, s.day_of_week]))

    // Optimistic update
    setSlots((prev) => prev.map((s) => {
      const newDay = dayUpdates.get(s.id)
      return newDay !== undefined ? { ...s, day_of_week: newDay } : s
    }))

    const moves = Array.from(dayUpdates.entries()).map(([id, day]) =>
      fetch(`/api/planner/slots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_of_week: day }),
      })
    )

    Promise.all(moves).catch(() => {
      // Revert all on error
      setSlots((prev) => prev.map((s) => {
        const orig = originalDays.get(s.id)
        return orig !== undefined ? { ...s, day_of_week: orig } : s
      }))
    })
  }

  async function handleGenerateShoppingList() {
    const dateFrom = weekStartStr
    const dateTo = toDateString(getWeekDays(weekStart)[6])

    setIsGeneratingList(true)

    const res = await fetch('/api/shopping/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date_from: dateFrom, date_to: dateTo, confirm_overwrite: true }),
    })

    if (res.ok) {
      const data = await res.json() as { list: { id: string } }
      await fetch('/api/shopping/make-smarter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_id: data.list.id }),
      })
      router.push(`/shopping?from=${dateFrom}&to=${dateTo}`)
    }

    setIsGeneratingList(false)
  }

  const weekDays = getWeekDays(weekStart)

  return (
    <div>
      <WeekNav weekStart={weekStart} />

      {loading ? (
        <div>
          {/* Desktop skeleton: header row + card row */}
          <div className="hidden md:grid grid-cols-7 gap-3 mb-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="animate-pulse text-center">
                <div className="h-4 bg-gray-200 rounded mb-2 mx-auto w-8" />
                <div className="h-6 bg-gray-200 rounded mb-2 mx-auto w-6" />
              </div>
            ))}
          </div>
          <div className="hidden md:grid grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-32 bg-gray-100 rounded-xl" />
              </div>
            ))}
          </div>
          {/* Mobile skeleton: stacked label + card rows */}
          <div className="md:hidden grid grid-cols-1 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-3 bg-gray-200 rounded mb-1.5 w-16" />
                <div className="h-32 bg-gray-100 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <DndContext
          collisionDetection={pointerWithin}
          onDragStart={(e) => {
            const slot = e.active.data.current?.slot as MealSlotWithRecipe | undefined
            setActiveSlot(slot ?? null)
          }}
          onDragEnd={handleDragEnd}
        >
          {/* Day headers — desktop only, always 7 × 1-column */}
          <div className="hidden md:grid grid-cols-7 gap-3 mb-2">
            {weekDays.map((date, index) => {
              const dow = index + 1
              const isToday = toDateString(date) === toDateString(today)
              const { weekday, day } = formatDayLabel(date)
              return <DayHeader key={dow} weekday={weekday} day={day} isToday={isToday} />
            })}
          </div>

          {/* Slot areas — spanning grid: a meal with span_days=N occupies N columns */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {(() => {
              const items: React.ReactNode[] = []
              let dow = 1
              while (dow <= 7) {
                const slot = slotByDay.get(dow) ?? null
                const maxSpanDays = 8 - dow
                // Clamp span to remaining days in the week
                const span = Math.min(slot?.span_days ?? 1, maxSpanDays)

                // Mobile date label: "Mon 25" or "Mon 25 – Wed 27"
                const startDate = weekDays[dow - 1]
                const { weekday: startWd, day: startDay } = formatDayLabel(startDate)
                let mobileDateLabel = `${startWd} ${startDay}`
                if (span > 1) {
                  const endDate = weekDays[Math.min(dow + span - 2, 6)]
                  const { weekday: endWd, day: endDay } = formatDayLabel(endDate)
                  mobileDateLabel += ` – ${endWd} ${endDay}`
                }
                // Highlight if today falls anywhere in this slot's range
                const mobileIsToday = Array.from({ length: span }, (_, i) => dow + i)
                  .some((d) => toDateString(weekDays[d - 1]) === toDateString(today))

                items.push(
                  <DaySlot
                    key={dow}
                    dayOfWeek={dow}
                    slot={slot}
                    gridColSpan={span}
                    maxSpanDays={maxSpanDays}
                    mobileDateLabel={mobileDateLabel}
                    mobileIsToday={mobileIsToday}
                    isSearchOpen={openSearchDay === dow}
                    onOpenSearch={() => setOpenSearchDay(dow)}
                    onCloseSearch={() => setOpenSearchDay(null)}
                    onAddRecipe={handleAddRecipe}
                    onAddCustom={handleAddCustom}
                    onDelete={handleDelete}
                    onSpanPreview={handleSpanPreview}
                    onSpanCommit={handleSpanCommit}
                  />
                )
                dow += span
              }
              return items
            })()}
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {activeSlot && (
              activeSlot.recipe_id ? (
                <SlotCard
                  slot={activeSlot}
                  onDelete={() => {}}
                  onSpanPreview={() => {}}
                  onSpanCommit={() => {}}
                  maxSpanDays={1}
                />
              ) : (
                <CustomLabelCard slot={activeSlot} onDelete={() => {}} />
              )
            )}
          </DragOverlay>
        </DndContext>
      )}

      {weekPlan && (
        <WeekRulesPanel
          weekPlanId={weekPlan.id}
          rules={weekRules}
          onAdd={(rule) => setWeekRules((prev) => [...prev, rule])}
          onDelete={(id) => setWeekRules((prev) => prev.filter((r) => r.id !== id))}
          onToggle={(id, isActive) =>
            setWeekRules((prev) => prev.map((r) => r.id === id ? { ...r, is_active: isActive } : r))
          }
        />
      )}

      {slots.some((s) => s.recipe_id) && (
        <div className="mt-6 pt-6 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={handleGenerateShoppingList}
            disabled={isGeneratingList}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGeneratingList ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <ShoppingCart size={14} />
            )}
            Generate shopping list
          </button>
        </div>
      )}
    </div>
  )
}
