import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RecipeTagStrip } from './RecipeTagStrip'

function renderPill(tag: string) {
  return <button key={tag}>{tag}</button>
}

const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

afterEach(() => {
  if (originalClientWidth) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
  }
})

describe('RecipeTagStrip', () => {
  it('renders every tag when they all fit (generous default test width)', () => {
    render(<RecipeTagStrip tags={['main', 'side', 'dessert']} renderPill={renderPill} />)

    const visible = screen.getByTestId('tag-strip-visible')
    expect(within(visible).getByText('main')).toBeInTheDocument()
    expect(within(visible).getByText('side')).toBeInTheDocument()
    expect(within(visible).getByText('dessert')).toBeInTheDocument()
  })

  it('renders only as many tags as fit a narrow container, and no more', () => {
    // Pills are stubbed at 60px wide (src/test/setup.ts) with an 8px gap.
    // A 90px container fits exactly one pill (60), not a second (60+8+60=128).
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 90 })

    render(<RecipeTagStrip tags={['main', 'side', 'dessert', 'quick', 'vegan']} renderPill={renderPill} />)

    const visible = screen.getByTestId('tag-strip-visible')
    expect(visible).toHaveTextContent('main')
    expect(visible).not.toHaveTextContent('side')
    expect(visible).not.toHaveTextContent('dessert')
  })

  it('grows back when the container widens again', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 700 })

    render(<RecipeTagStrip tags={['main', 'side', 'dessert', 'quick', 'vegan']} renderPill={renderPill} />)

    const visible = screen.getByTestId('tag-strip-visible')
    expect(visible).toHaveTextContent('main')
    expect(visible).toHaveTextContent('side')
    expect(visible).toHaveTextContent('dessert')
    expect(visible).toHaveTextContent('quick')
    expect(visible).toHaveTextContent('vegan')
  })

  it('never enables horizontal scrolling on the visible row', () => {
    render(<RecipeTagStrip tags={['main', 'side', 'dessert']} renderPill={renderPill} />)

    const visible = screen.getByTestId('tag-strip-visible')
    expect(visible.className).not.toMatch(/overflow-x-auto|overflow-x-scroll/)
  })
})
