'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { DndContext, DragEndEvent, DragOverlay, pointerWithin } from '@dnd-kit/core'
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
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(null)
  const [slots, setSlots] = useState<MealSlotWithRecipe[]>([])
  const [weekRules, setWeekRules] = useState<WeekPlanRule[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSlot, setActiveSlot] = useState<MealSlotWithRecipe | null>(null)
  const [openSearchDay, setOpenSearchDay] = useState<number | null>(null)

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

  async function handleSpanChange(slotId: string, delta: number) {
    const slot = slots.find((s) => s.id === slotId)
    if (!slot) return
    const newSpan = Math.max(1, Math.min(7, slot.span_days + delta))
    if (newSpan === slot.span_days) return

    setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, span_days: newSpan } : s))
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

    const displacedSlot = slotByDay.get(targetDay) ?? null
    const originalDay = draggedSlot.day_of_week

    // Optimistic update: move dragged slot, swap displaced slot to original day
    setSlots((prev) => prev.map((s) => {
      if (s.id === draggedSlot.id) return { ...s, day_of_week: targetDay }
      if (displacedSlot && s.id === displacedSlot.id) return { ...s, day_of_week: originalDay }
      return s
    }))

    const moves = [
      fetch(`/api/planner/slots/${draggedSlot.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_of_week: targetDay }),
      }),
      ...(displacedSlot ? [
        fetch(`/api/planner/slots/${displacedSlot.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day_of_week: originalDay }),
        }),
      ] : []),
    ]

    Promise.all(moves).catch(() => {
      // Revert both on any error
      setSlots((prev) => prev.map((s) => {
        if (s.id === draggedSlot.id) return { ...s, day_of_week: originalDay }
        if (displacedSlot && s.id === displacedSlot.id) return { ...s, day_of_week: targetDay }
        return s
      }))
    })
  }

  const weekDays = getWeekDays(weekStart)

  return (
    <div>
      <WeekNav weekStart={weekStart} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2 mx-auto w-8" />
              <div className="h-6 bg-gray-200 rounded mb-2 mx-auto w-6" />
              <div className="h-32 bg-gray-100 rounded-xl" />
            </div>
          ))}
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
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {weekDays.map((date, index) => {
              const dow = index + 1
              const isToday = toDateString(date) === toDateString(today)
              const slot = slotByDay.get(dow) ?? null
              const coveredBy = coveredBySlot.get(dow) ?? null

              // How many days remain in the week from this day (for span control)
              const maxSpanDays = 8 - dow

              return (
                <DaySlot
                  key={dow}
                  dayLabel={formatDayLabel(date)}
                  dayOfWeek={dow}
                  slot={slot}
                  coveredBy={coveredBy}
                  isToday={isToday}
                  maxSpanDays={maxSpanDays}
                  isSearchOpen={openSearchDay === dow}
                  onOpenSearch={() => setOpenSearchDay(dow)}
                  onCloseSearch={() => setOpenSearchDay(null)}
                  onAddRecipe={handleAddRecipe}
                  onAddCustom={handleAddCustom}
                  onDelete={handleDelete}
                  onSpanChange={handleSpanChange}
                />
              )
            })}
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {activeSlot && (
              activeSlot.recipe_id ? (
                <SlotCard
                  slot={activeSlot}
                  onDelete={() => {}}
                  onSpanChange={() => {}}
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
          <Link
            href={`/shopping?from=${weekStartStr}&to=${toDateString(weekDays[6])}`}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ShoppingCart size={14} />
            Generate shopping list
          </Link>
        </div>
      )}
    </div>
  )
}
