import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import { IngredientEditor } from './IngredientEditor'
import type { IngredientFormItem } from '@/types/recipe'

// Capture the onDragEnd handler passed to DndContext so tests can invoke it directly
let capturedOnDragEnd: ((event: { active: { id: string }; over: { id: string } | null }) => void) | undefined

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode
    onDragEnd: (e: { active: { id: string }; over: { id: string } | null }) => void
  }) => {
    capturedOnDragEnd = onDragEnd
    return React.createElement(React.Fragment, null, children)
  },
  closestCenter: {},
  PointerSensor: class {},
  useSensor: () => ({}),
  useSensors: (...sensors: unknown[]) => sensors,
}))

vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>()
  return {
    ...actual,
    SortableContext: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
    verticalListSortingStrategy: {},
  }
})

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

const makeIngredient = (id: string, name: string): IngredientFormItem => ({
  id,
  quantity: '1',
  unit: 'cup',
  name,
  notes: '',
})

const ingA = makeIngredient('id-a', 'Flour')
const ingB = makeIngredient('id-b', 'Sugar')
const ingC = makeIngredient('id-c', 'Butter')

beforeEach(() => {
  capturedOnDragEnd = undefined
})

describe('IngredientEditor — drag to reorder', () => {
  it('calls onChange with reordered ingredients when dragging first item to last position', () => {
    const onChange = vi.fn()
    render(<IngredientEditor ingredients={[ingA, ingB, ingC]} onChange={onChange} />)

    capturedOnDragEnd!({ active: { id: 'id-a' }, over: { id: 'id-c' } })

    expect(onChange).toHaveBeenCalledWith([ingB, ingC, ingA])
  })

  it('calls onChange with reordered ingredients when dragging last item to first position', () => {
    const onChange = vi.fn()
    render(<IngredientEditor ingredients={[ingA, ingB, ingC]} onChange={onChange} />)

    capturedOnDragEnd!({ active: { id: 'id-c' }, over: { id: 'id-a' } })

    expect(onChange).toHaveBeenCalledWith([ingC, ingA, ingB])
  })

  it('does not call onChange when dropped on the same position', () => {
    const onChange = vi.fn()
    render(<IngredientEditor ingredients={[ingA, ingB, ingC]} onChange={onChange} />)

    capturedOnDragEnd!({ active: { id: 'id-b' }, over: { id: 'id-b' } })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not call onChange when dropped outside a valid target', () => {
    const onChange = vi.fn()
    render(<IngredientEditor ingredients={[ingA, ingB, ingC]} onChange={onChange} />)

    capturedOnDragEnd!({ active: { id: 'id-a' }, over: null })

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('IngredientEditor — mobile edit modal', () => {
  it('shows a collapsed summary for each ingredient on mobile', () => {
    render(<IngredientEditor ingredients={[ingA]} onChange={vi.fn()} />)

    expect(screen.getByText('1 cup Flour')).toBeInTheDocument()
  })

  it('shows a placeholder when the ingredient has no details yet', () => {
    const empty = { id: 'id-empty', quantity: '', unit: '', name: '', notes: '' }
    render(<IngredientEditor ingredients={[empty]} onChange={vi.fn()} />)

    expect(screen.getByText('Tap to add ingredient')).toBeInTheDocument()
  })

  it('opens an edit modal with the ingredient fields when the summary is tapped', () => {
    render(<IngredientEditor ingredients={[ingA]} onChange={vi.fn()} />)

    fireEvent.click(screen.getByText('1 cup Flour'))

    const dialog = screen.getByRole('dialog', { name: 'Edit ingredient' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue('Flour')).toBeInTheDocument()
  })

  it('updates the ingredient when a field is edited inside the modal', () => {
    const onChange = vi.fn()
    render(<IngredientEditor ingredients={[ingA]} onChange={onChange} />)

    fireEvent.click(screen.getByText('1 cup Flour'))
    const dialog = screen.getByRole('dialog', { name: 'Edit ingredient' })
    fireEvent.change(within(dialog).getByPlaceholderText('finely chopped'), { target: { value: 'sifted' } })

    expect(onChange).toHaveBeenCalledWith([{ ...ingA, notes: 'sifted' }])
  })

  it('closes the modal when Done is clicked', () => {
    render(<IngredientEditor ingredients={[ingA]} onChange={vi.fn()} />)

    fireEvent.click(screen.getByText('1 cup Flour'))
    fireEvent.click(screen.getByText('Done'))

    expect(screen.queryByRole('dialog', { name: 'Edit ingredient' })).not.toBeInTheDocument()
  })
})
