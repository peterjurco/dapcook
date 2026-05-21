import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
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
