import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranslationValues } from 'use-intl'
import { ShoppingItemRow } from './ShoppingItemRow'
import { mockTranslate } from '@/test/mockMessages'
import type { ShoppingItem } from '@/types/database'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

const onCheck = vi.fn()
const onUpdate = vi.fn()
const onDelete = vi.fn()

beforeEach(() => vi.clearAllMocks())

function item(p: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: 'i1',
    shopping_list_id: 'l1',
    name: 'rice',
    quantity: 200,
    unit: 'g',
    category: null,
    is_checked: false,
    sort_order: 0,
    source_recipe_ids: [],
    ...p,
  }
}

function renderRow(p: Partial<ShoppingItem> = {}, isNewItem = false) {
  render(
    <ShoppingItemRow
      item={item(p)}
      recipeNames={{}}
      onCheck={onCheck}
      onUpdate={onUpdate}
      onDelete={onDelete}
      isNewItem={isNewItem}
    />,
  )
}

async function openEditor() {
  await userEvent.click(screen.getByText('rice'))
  return screen.getByDisplayValue('200g rice')
}

describe('ShoppingItemRow', () => {
  it('does not update when the editor is blurred without changes', async () => {
    renderRow()
    await openEditor()
    await userEvent.tab()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('200g')).toBeInTheDocument()
  })

  it('does not update when the editor is cleared and blurred', async () => {
    renderRow()
    await userEvent.clear(await openEditor())
    await userEvent.tab()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('saves changed text as a free-text name', async () => {
    renderRow()
    const editor = await openEditor()
    await userEvent.clear(editor)
    await userEvent.type(editor, 'brown rice{Enter}')
    expect(onUpdate).toHaveBeenCalledWith('i1', { name: 'brown rice', quantity: null, unit: null })
  })

  it('discards a new item saved empty', async () => {
    renderRow({ name: '', quantity: null, unit: null }, true)
    await userEvent.tab()
    expect(onDelete).toHaveBeenCalledWith('i1')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('saves a new item with typed text', async () => {
    renderRow({ name: '', quantity: null, unit: null }, true)
    await userEvent.type(screen.getByRole('textbox'), 'milk{Enter}')
    expect(onUpdate).toHaveBeenCalledWith('i1', { name: 'milk', quantity: null, unit: null })
  })
})
