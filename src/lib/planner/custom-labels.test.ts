import { describe, it, expect } from 'vitest'
import { isPresetLabel, translateCustomLabel } from './custom-labels'
import { CUSTOM_LABELS } from '@/types/planner'

const t = (key: string) => `translated:${key}`

describe('translateCustomLabel', () => {
  it.each(CUSTOM_LABELS)('translates the preset label %s', (label) => {
    expect(translateCustomLabel(label, t)).toMatch(/^translated:customLabels\./)
  })

  it('maps multi-word presets to a camelCase key', () => {
    expect(translateCustomLabel('Eating out', t)).toBe('translated:customLabels.eatingOut')
  })

  it('returns user-typed labels unchanged', () => {
    expect(translateCustomLabel('Babkine halušky', t)).toBe('Babkine halušky')
  })
})

describe('isPresetLabel', () => {
  it('recognises presets', () => {
    expect(isPresetLabel('Fasting')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isPresetLabel('Pizza')).toBe(false)
  })
})
