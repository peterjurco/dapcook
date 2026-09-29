import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TagInput } from './TagInput'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'
import type { TagData } from '@/app/api/tags/route'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) => mockTranslate(namespace, key, values),
}))

const ALL_TAGS: TagData[] = [
  { name: 'dinner', color: null, groupId: null, count: 9 },
  { name: 'quick', color: null, groupId: null, count: 5 },
  { name: 'pasta', color: '#ef4444', groupId: null, count: 2 },
]

function renderInput(props: Partial<React.ComponentProps<typeof TagInput>> = {}) {
  const onChange = vi.fn()
  render(<TagInput tags={[]} onChange={onChange} allTags={ALL_TAGS} {...props} />)
  return { onChange }
}

describe('TagInput suggestions', () => {
  it('shows most used tags when there are no suggestions', () => {
    renderInput({ suggestions: null })
    expect(screen.getByText('Most used')).toBeInTheDocument()
    expect(screen.queryByText('Suggested')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'dinner' })).toBeInTheDocument()
  })

  it('shows suggestions instead of most used', () => {
    renderInput({ suggestions: { existing: ['pasta'], new: null } })
    expect(screen.getByText('Suggested')).toBeInTheDocument()
    expect(screen.queryByText('Most used')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'pasta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'dinner' })).not.toBeInTheDocument()
  })

  it('marks the new tag and adds it on click', () => {
    const { onChange } = renderInput({ suggestions: { existing: [], new: 'italian' } })
    const chip = screen.getByRole('button', { name: /italian/ })
    expect(chip).toHaveTextContent('New')
    fireEvent.click(chip)
    expect(onChange).toHaveBeenCalledWith(['italian'])
  })

  it('hides suggestions that are already selected', () => {
    renderInput({ tags: ['pasta', 'italian'], suggestions: { existing: ['pasta', 'dinner'], new: 'italian' } })
    expect(screen.getByRole('button', { name: 'dinner' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New/ })).not.toBeInTheDocument()
  })

  it('falls back to most used when every suggestion is already selected', () => {
    renderInput({ tags: ['pasta'], suggestions: { existing: ['pasta'], new: null } })
    expect(screen.getByText('Most used')).toBeInTheDocument()
  })

  it('requests suggestions when the input gains focus', () => {
    const onRequestSuggestions = vi.fn()
    renderInput({ onRequestSuggestions })
    fireEvent.focus(screen.getByPlaceholderText('Type a tag and press Enter'))
    expect(onRequestSuggestions).toHaveBeenCalledTimes(1)
  })

  it('hides the suggestions row while typing', () => {
    renderInput({ suggestions: { existing: ['pasta'], new: 'italian' } })
    fireEvent.change(screen.getByPlaceholderText('Type a tag and press Enter'), { target: { value: 'x' } })
    expect(screen.queryByText('Suggested')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'pasta' })).not.toBeInTheDocument()
  })

  it('adds a suggested existing tag on click', () => {
    const { onChange } = renderInput({ tags: ['quick'], suggestions: { existing: ['pasta'], new: null } })
    fireEvent.click(screen.getByRole('button', { name: 'pasta' }))
    expect(onChange).toHaveBeenCalledWith(['quick', 'pasta'])
  })
})

describe('TagInput layout', () => {
  const PLACEHOLDER = 'Type a tag and press Enter'

  it('renders selected tags inside the input box', () => {
    renderInput({ tags: ['pasta', 'quick'] })
    const box = screen.getByTestId('tag-input-box')
    expect(box).toContainElement(screen.getByPlaceholderText(PLACEHOLDER))
    expect(box).toHaveTextContent('pasta')
    expect(box).toHaveTextContent('quick')
  })

  it('focuses the text input when the box is clicked', () => {
    renderInput({ tags: ['pasta'] })
    fireEvent.click(screen.getByTestId('tag-input-box'))
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveFocus()
  })

  it('removes a selected tag via its remove button', () => {
    const { onChange } = renderInput({ tags: ['pasta', 'quick'] })
    fireEvent.click(screen.getByRole('button', { name: 'Remove pasta' }))
    expect(onChange).toHaveBeenCalledWith(['quick'])
  })

  it('has no separate helper line', () => {
    renderInput()
    expect(screen.queryByText('Press Enter or comma to add')).not.toBeInTheDocument()
  })

  it('shows the suggestion label on the same row as the chips', () => {
    renderInput({ suggestions: { existing: ['pasta'], new: 'italian' } })
    const row = screen.getByTestId('tag-suggestions')
    expect(row).toHaveTextContent('Suggested')
    expect(row).toContainElement(screen.getByRole('button', { name: 'pasta' }))
    expect(row).toContainElement(screen.getByRole('button', { name: /italian/ }))
  })

  it('shows the most-used label on the same row as the chips', () => {
    renderInput()
    const row = screen.getByTestId('tag-suggestions')
    expect(row).toHaveTextContent('Most used')
    expect(row).toContainElement(screen.getByRole('button', { name: 'dinner' }))
  })
})
