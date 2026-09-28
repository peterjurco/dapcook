import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { StepEditor } from './StepEditor'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'
import type { Step } from '@/types/recipe'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

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
  KeyboardSensor: class {},
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

const steps: Step[] = [
  { id: 'id-a', order: 1, text: 'Chop' },
  { id: 'id-b', order: 2, text: 'Fry' },
  { id: 'id-c', order: 3, text: 'Serve' },
]

beforeEach(() => {
  capturedOnDragEnd = undefined
})

describe('StepEditor — drag to reorder', () => {
  it('moves the first step to the end and renumbers order', () => {
    const onChange = vi.fn()
    render(<StepEditor steps={steps} onChange={onChange} />)

    capturedOnDragEnd!({ active: { id: 'id-a' }, over: { id: 'id-c' } })

    expect(onChange).toHaveBeenCalledWith([
      { id: 'id-b', order: 1, text: 'Fry' },
      { id: 'id-c', order: 2, text: 'Serve' },
      { id: 'id-a', order: 3, text: 'Chop' },
    ])
  })

  it('moves the last step to the start and renumbers order', () => {
    const onChange = vi.fn()
    render(<StepEditor steps={steps} onChange={onChange} />)

    capturedOnDragEnd!({ active: { id: 'id-c' }, over: { id: 'id-a' } })

    expect(onChange).toHaveBeenCalledWith([
      { id: 'id-c', order: 1, text: 'Serve' },
      { id: 'id-a', order: 2, text: 'Chop' },
      { id: 'id-b', order: 3, text: 'Fry' },
    ])
  })

  it('does nothing when dropped outside the list', () => {
    const onChange = vi.fn()
    render(<StepEditor steps={steps} onChange={onChange} />)

    capturedOnDragEnd!({ active: { id: 'id-a' }, over: null })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('does nothing when dropped on itself', () => {
    const onChange = vi.fn()
    render(<StepEditor steps={steps} onChange={onChange} />)

    capturedOnDragEnd!({ active: { id: 'id-b' }, over: { id: 'id-b' } })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders the step number as a labelled drag handle', () => {
    render(<StepEditor steps={steps} onChange={vi.fn()} />)

    const handle = screen.getByRole('button', { name: 'Drag to reorder step 2' })
    expect(handle).toHaveTextContent('2')
  })
})
