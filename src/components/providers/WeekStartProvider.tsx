'use client'

import { createContext, useContext } from 'react'
import type { WeekStartDay } from '@/lib/utils/week'

const WeekStartContext = createContext<WeekStartDay>('monday')

/** Makes the household's week start day available to client components. */
export function WeekStartProvider({ value, children }: { value: WeekStartDay; children: React.ReactNode }) {
  return <WeekStartContext.Provider value={value}>{children}</WeekStartContext.Provider>
}

export function useWeekStartDay(): WeekStartDay {
  return useContext(WeekStartContext)
}
