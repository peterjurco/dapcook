import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TranslationValues } from 'use-intl'
import { RangeFilter } from './RangeFilter'
import { TIME_PRESETS, type Range } from '@/lib/recipes/filters'
import { mockTranslate } from '@/test/mockMessages'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

function Harness({ initial = null, onChange = () => {} }: { initial?: Range | null; onChange?: (r: Range | null) => void }) {
  const [value, setValue] = useState<Range | null>(initial)
  return (
    <RangeFilter
      label="Total time (min)"
      presets={TIME_PRESETS}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

const chip = (name: string) => screen.getByRole('button', { name })
const from = () => screen.getByRole('textbox', { name: 'Total time (min): From' })
const to = () => screen.getByRole('textbox', { name: 'Total time (min): To' })

describe('RangeFilter', () => {
  it('selects a preset and clears it on a second tap', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)

    await user.click(chip('15–30'))
    expect(onChange).toHaveBeenLastCalledWith({ min: 16, max: 30 })
    expect(chip('15–30')).toHaveAttribute('aria-pressed', 'true')

    await user.click(chip('15–30'))
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(chip('15–30')).toHaveAttribute('aria-pressed', 'false')
  })

  it('hides the inputs until Custom is tapped, then pre-fills them from the current range', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    await user.click(chip('15–30'))
    await user.click(chip('Custom'))
    expect(from()).toHaveValue('16')
    expect(to()).toHaveValue('30')
  })

  it('emits an open-ended range when only one input is filled', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)

    await user.click(chip('Custom'))
    await user.type(from(), '20')
    expect(onChange).toHaveBeenLastCalledWith({ min: 20, max: null })
    expect(chip('Custom')).toHaveAttribute('aria-pressed', 'true')
  })

  it('lights up the preset a typed range equals, keeping the inputs open', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(chip('Custom'))
    await user.type(to(), '15')
    expect(chip('≤ 15')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Custom')).toHaveAttribute('aria-pressed', 'false')
    expect(to()).toBeInTheDocument()
  })

  it('ignores non-digits and clears the range when both inputs are emptied', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)

    await user.click(chip('Custom'))
    await user.type(from(), '2a')
    expect(from()).toHaveValue('2')
    await user.clear(from())
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('keeps custom inputs open and focused while editing, even if the typed value equals a preset', async () => {
    const user = userEvent.setup()
    render(<Harness initial={{ min: null, max: 150 }} />)

    const toInput = to()
    toInput.focus()
    await user.keyboard('{Backspace}')

    expect(screen.getByRole('textbox', { name: 'Total time (min): To' })).toBe(document.activeElement)
    expect(chip('≤ 15')).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the inputs straight away for a custom range, and clears it when Custom is closed', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial={{ min: 20, max: 40 }} onChange={onChange} />)

    expect(from()).toHaveValue('20')
    await user.click(chip('Custom'))
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
