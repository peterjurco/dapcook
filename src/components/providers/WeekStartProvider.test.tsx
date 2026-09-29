import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeekStartProvider, useWeekStartDay } from './WeekStartProvider'

function Probe() {
  return <span>{useWeekStartDay()}</span>
}

describe('WeekStartProvider', () => {
  it('provides the household week start day', () => {
    render(<WeekStartProvider value="saturday"><Probe /></WeekStartProvider>)
    expect(screen.getByText('saturday')).toBeInTheDocument()
  })

  it('defaults to Monday outside a provider', () => {
    render(<Probe />)
    expect(screen.getByText('monday')).toBeInTheDocument()
  })
})
