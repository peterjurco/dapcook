import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ResizeHandle } from './ResizeHandle'

let mockHighlighted = false
vi.mock('@/components/tour/TourProvider', () => ({
  useTourStep: (target: string) => mockHighlighted && target === 'grid-resize',
}))

const props = { show: true, isResizing: false, title: 'Resize', onMouseDown: () => {} }

describe('ResizeHandle', () => {
  it('is a tour target that is hover-revealed by default', () => {
    mockHighlighted = false
    render(<ResizeHandle {...props} />)
    const handle = screen.getByLabelText('Resize')
    expect(handle).toHaveAttribute('data-tour', 'grid-resize')
    expect(handle).toHaveClass('opacity-0')
  })

  it('is forced visible while the tour step points at it', () => {
    mockHighlighted = true
    render(<ResizeHandle {...props} />)
    const handle = screen.getByLabelText('Resize')
    expect(handle).toHaveClass('opacity-100')
    expect(handle).not.toHaveClass('opacity-0')
  })
})
