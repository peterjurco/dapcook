'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CalendarDays, ChefHat, Pencil, ShoppingCart, X } from 'lucide-react'
import { usePostHog } from 'posthog-js/react'
import { DndContext, DragEndEvent, DragOverlay, pointerWithin } from '@dnd-kit/core'
import { SlotCard } from './SlotCard'
import { CustomLabelCard } from './CustomLabelCard'
import { WeekNav } from './WeekNav'
import { MobileEditList } from './MobileEditList'
import { PlannerDesktopGrid } from './PlannerDesktopGrid'
import { PlannerMobileAgenda } from './PlannerMobileAgenda'
import { getWeekDays, toDateString } from '@/lib/utils/week'
import { buildEditDays, maxSpanForStart } from '@/lib/planner/layout'
import { getCachedWeekData, setCachedWeekData, updateCachedWeekSlots } from './plannerWeekCache'
import type { MealSlotWithRecipe, WeekData } from '@/types/planner'
import type { Recipe, WeekPlan } from '@/types/database'

interface PlannerClientProps {
  weekStart: Date
}

export function PlannerClient({ weekStart }: PlannerClientProps) {
  const posthog = usePostHog()
  const router = useRouter()
  const weekStartStr = toDateString(weekStart)
  const cachedWeekData = getCachedWeekData(weekStartStr)
  const [weekPlan, setWeekPlan] = useState<WeekPlan | null>(cachedWeekData?.weekPlan ?? null)
  const [slots, setSlots] = useState<MealSlotWithRecipe[]>(cachedWeekData?.slots ?? [])
  const [loading, setLoading] = useState(!cachedWeekData)
  const [activeSlot, setActiveSlot] = useState<MealSlotWithRecipe | null>(null)
  const [openSearchDay, setOpenSearchDay] = useState<number | null>(null)
  const [addingToDay, setAddingToDay] = useState<number | null>(null)
  const [isMobileEditMode, setIsMobileEditMode] = useState(false)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const loadWeek = useCallback(async () => {
    const cached = getCachedWeekData(weekStartStr)
    if (cached) {
      setWeekPlan(cached.weekPlan)
      setSlots(cached.slots)
      setLoading(false)
    } else {
      setLoading(true)
    }

    const res = await fetch(`/api/planner/week?week=${weekStartStr}`)
    if (res.ok) {
      const data = await res.json() as WeekData
      setCachedWeekData(weekStartStr, data)
      setWeekPlan(data.weekPlan)
      setSlots(data.slots)
    }
    setLoading(false)
  }, [weekStartStr])

  const setSlotsAndCache = useCallback((update: (prev: MealSlotWithRecipe[]) => MealSlotWithRecipe[]) => {
    setSlots((prev) => {
      const next = update(prev)
      updateCachedWeekSlots(weekStartStr, weekPlan, () => next)
      return next
    })
  }, [weekPlan, weekStartStr])

  useEffect(() => {
    loadWeek()
  }, [loadWeek])

  async function handleAddRecipe(dayOfWeek: number, recipe: Recipe) {
    setAddingToDay(dayOfWeek)
    const res = await fetch('/api/planner/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: weekStartStr, day_of_week: dayOfWeek, recipe_id: recipe.id }),
    })
    if (res.ok) {
      const slot = await res.json() as MealSlotWithRecipe
      setSlotsAndCache((prev) => [...prev, slot])
      posthog.capture('meal_planned')
      if (!weekPlan) loadWeek() // refresh to get weekPlan
    }
    setAddingToDay(null)
  }

  async function handleAddCustom(dayOfWeek: number, label: string) {
    setAddingToDay(dayOfWeek)
    const res = await fetch('/api/planner/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: weekStartStr, day_of_week: dayOfWeek, custom_label: label }),
    })
    if (res.ok) {
      const slot = await res.json() as MealSlotWithRecipe
      setSlotsAndCache((prev) => [...prev, slot])
      if (!weekPlan) loadWeek()
    }
    setAddingToDay(null)
  }

  async function handleDelete(slotId: string) {
    setSlotsAndCache((prev) => prev.filter((s) => s.id !== slotId))
    await fetch(`/api/planner/slots/${slotId}`, { method: 'DELETE' })
  }

  // Move a meal to another start day. Overlaps are allowed — no other slot is touched.
  function handleMove(slotId: string, newDay: number) {
    const slot = slots.find((s) => s.id === slotId)
    if (!slot) return
    const day = Math.max(1, Math.min(8 - slot.span_days, newDay))
    if (day === slot.day_of_week) return
    const prevDay = slot.day_of_week
    setSlotsAndCache((prev) => prev.map((s) => (s.id === slotId ? { ...s, day_of_week: day } : s)))
    fetch(`/api/planner/slots/${slotId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: day }),
    }).catch(() => {
      setSlotsAndCache((prev) => prev.map((s) => (s.id === slotId ? { ...s, day_of_week: prevDay } : s)))
    })
  }

  // Live span change during desktop resize drag — state only, no API.
  function handleSpanPreview(slotId: string, newSpan: number) {
    setSlotsAndCache((prev) => prev.map((s) => (s.id === slotId ? { ...s, span_days: newSpan } : s)))
  }

  // Persist a span change (desktop resize release, or mobile ‹ › tap). Clamped to the week.
  async function handleSpanCommit(slotId: string, newSpan: number) {
    const slot = slots.find((s) => s.id === slotId)
    if (!slot) return
    const span = Math.max(1, Math.min(maxSpanForStart(slot.day_of_week), newSpan))
    setSlotsAndCache((prev) => prev.map((s) => (s.id === slotId ? { ...s, span_days: span } : s)))
    await fetch(`/api/planner/slots/${slotId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ span_days: span }),
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveSlot(null)
    const { active, over } = event
    if (!over) return
    const draggedSlot = active.data.current?.slot as MealSlotWithRecipe | undefined
    const targetDay = over.data.current?.dayOfWeek as number | undefined
    if (!draggedSlot || !targetDay) return
    handleMove(draggedSlot.id, targetDay)
  }

  const weekDays = getWeekDays(weekStart)
  const isWeekEmpty = slots.length === 0
  const hasRecipeSlots = slots.some((s) => s.recipe_id)

  return (
    <div>
      {/* Page heading */}
      <div className="mb-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            <span className="text-emerald-700 font-fraunces">W</span>eekly Planner
          </h1>
          <p className="text-sm text-gray-500 mt-1">Plan your meals for the week</p>
        </div>
      </div>

      <WeekNav weekStart={weekStart} />

      {!loading && !isWeekEmpty && (
        <PlannerActions
          hasRecipeSlots={hasRecipeSlots}
          isMobileEditMode={isMobileEditMode}
          onToggleMobileEdit={() => setIsMobileEditMode((v) => !v)}
          onGenerateShoppingList={() => router.push(`/shopping/generate?week=${weekStartStr}`)}
        />
      )}

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
      ) : isWeekEmpty ? (
        <PlannerEmptyState onBrowseRecipes={() => router.push('/recipes')} />
      ) : (
        <>
          {/* Desktop — always-editable lane calendar (independent of mobile edit toggle) */}
          <div className="hidden md:block">
            <DndContext
              collisionDetection={pointerWithin}
              onDragStart={(e) => {
                const slot = e.active.data.current?.slot as MealSlotWithRecipe | undefined
                setActiveSlot(slot ?? null)
              }}
              onDragEnd={handleDragEnd}
            >
              <PlannerDesktopGrid
                weekDays={weekDays}
                today={today}
                slots={slots}
                openSearchDay={openSearchDay}
                addingToDay={addingToDay}
                onOpenSearch={(day) => setOpenSearchDay(day)}
                onCloseSearch={() => setOpenSearchDay(null)}
                onAddRecipe={handleAddRecipe}
                onAddCustom={handleAddCustom}
                onDelete={handleDelete}
                onSpanPreview={handleSpanPreview}
                onSpanCommit={handleSpanCommit}
              />
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
          </div>

          {/* Mobile — read-only agenda (View) or per-day edit list (Edit) */}
          <div className="md:hidden">
            {isMobileEditMode ? (
              <MobileEditList
                editDays={buildEditDays(slots)}
                weekDays={weekDays}
                onMove={handleMove}
                onDelete={handleDelete}
                onSpanChange={handleSpanCommit}
                onAddRecipe={handleAddRecipe}
                onAddCustom={handleAddCustom}
              />
            ) : (
              <PlannerMobileAgenda weekDays={weekDays} today={today} slots={slots} />
            )}
          </div>
        </>
      )}

      {hasRecipeSlots && (
        <section aria-label="Shopping list actions" className="hidden md:flex mt-6 pt-6 border-t border-gray-100 justify-end">
          <button
            type="button"
            onClick={() => router.push(`/shopping/generate?week=${weekStartStr}`)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            <ShoppingCart size={14} />
            Generate shopping list
          </button>
        </section>
      )}

    </div>
  )
}

function PlannerActions({
  hasRecipeSlots,
  isMobileEditMode,
  onToggleMobileEdit,
  onGenerateShoppingList,
}: {
  hasRecipeSlots: boolean
  isMobileEditMode: boolean
  onToggleMobileEdit: () => void
  onGenerateShoppingList: () => void
}) {
  if (isMobileEditMode) {
    return (
      <section
        aria-label="Planner actions"
        className="-mt-3 mb-6 flex flex-row items-stretch gap-2 md:hidden"
      >
        <button
          type="button"
          onClick={onToggleMobileEdit}
          className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
        >
          <X size={15} />
          Done
        </button>
      </section>
    )
  }

  return (
    <section
      aria-label="Planner actions"
      className="-mt-3 mb-6 flex flex-row items-stretch gap-2 md:hidden"
    >
      <button
        type="button"
        onClick={onToggleMobileEdit}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
      >
        <Pencil size={15} />
        Edit
      </button>

      {hasRecipeSlots && (
        <button
          type="button"
          onClick={onGenerateShoppingList}
          className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
        >
          <ShoppingCart size={14} />
          Generate shopping list
        </button>
      )}
    </section>
  )
}

function PlannerEmptyState({ onBrowseRecipes }: { onBrowseRecipes: () => void }) {
  return (
    <section className="min-h-[360px] flex flex-col items-center justify-center text-center px-4 py-14">
      <div className="relative mb-7 h-32 w-36" aria-hidden="true">
        <div className="absolute left-1/2 top-3 h-24 w-28 -translate-x-1/2 rounded-2xl border border-gray-200 bg-white shadow-sm" />
        <div className="absolute left-1/2 top-3 h-7 w-28 -translate-x-1/2 rounded-t-2xl bg-gray-900" />
        <div className="absolute left-1/2 top-12 grid w-20 -translate-x-1/2 grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <span key={index} className="h-2.5 rounded-full bg-gray-200" />
          ))}
        </div>
        <div className="absolute bottom-2 right-0 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 shadow-sm">
          <ChefHat size={30} className="text-emerald-700" />
        </div>
        <div className="absolute left-2 top-0 flex h-10 w-10 items-center justify-center rounded-full border border-sky-100 bg-sky-50">
          <CalendarDays size={20} className="text-sky-700" />
        </div>
      </div>

      <h2 className="text-2xl font-semibold text-gray-950">Nothing planned for this week</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-gray-500">
        Pick a recipe you like and add it to the plan from your cookbook.
      </p>
      <button
        type="button"
        onClick={onBrowseRecipes}
        className="mt-7 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
      >
        Browse recipes
        <ArrowRight size={15} />
      </button>
    </section>
  )
}
