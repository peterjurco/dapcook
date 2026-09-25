import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'

function renderStepper(value: number, onChange = vi.fn()) {
  render(
    <Stepper
      value={value}
      min={1}
      max={3}
      onChange={onChange}
      label="Portions"
      decreaseLabel="Fewer"
      increaseLabel="More"
    />,
  )
  return onChange
}

describe('Stepper', () => {
  it('shows the value in a labelled group', () => {
    renderStepper(2)
    expect(screen.getByRole('group', { name: 'Portions' })).toHaveTextContent('2')
  })

  it('steps the value down and up', async () => {
    const onChange = renderStepper(2)
    await userEvent.click(screen.getByRole('button', { name: 'Fewer' }))
    expect(onChange).toHaveBeenLastCalledWith(1)
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(onChange).toHaveBeenLastCalledWith(3)
  })

  it('disables decrease at the minimum and increase at the maximum', () => {
    renderStepper(1)
    expect(screen.getByRole('button', { name: 'Fewer' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'More' })).toBeEnabled()
  })

  it('disables increase at the maximum', () => {
    renderStepper(3)
    expect(screen.getByRole('button', { name: 'More' })).toBeDisabled()
  })
})
