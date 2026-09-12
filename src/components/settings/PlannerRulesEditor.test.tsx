import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PlannerRulesEditor } from './PlannerRulesEditor'
import { mockTranslate } from '@/test/mockMessages'
import type { PlannerRule } from '@/types/database'
import type { TranslationValues } from 'use-intl'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

function rule(p: { id: string; label: string; is_active?: boolean }): PlannerRule {
  return {
    id: p.id,
    household_id: 'h',
    rule_type: 'custom',
    label: p.label,
    config: {},
    is_active: p.is_active ?? true,
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

describe('PlannerRulesEditor', () => {
  it('does not offer adding a rule while AI planning is unavailable', () => {
    render(<PlannerRulesEditor initialRules={[]} />)
    expect(screen.queryByRole('button', { name: /add rule/i })).toBeNull()
    expect(screen.getByText(/once ai planning ships/i)).toBeInTheDocument()
  })

  it('still lists existing rules', () => {
    render(<PlannerRulesEditor initialRules={[rule({ id: 'r1', label: 'No repeats within 5 days' })]} />)
    expect(screen.getByText('No repeats within 5 days')).toBeInTheDocument()
  })
})
