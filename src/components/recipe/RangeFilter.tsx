'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { presetFor, type Range, type RangePreset } from '@/lib/recipes/filters'

interface RangeFilterProps {
  label: string
  presets: readonly RangePreset[]
  value: Range | null
  onChange: (next: Range | null) => void
}

function parseBound(raw: string): number | null {
  const digits = raw.replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'px-3 py-1.5 text-sm rounded-full border border-gray-900 bg-gray-900 text-white transition-colors'
          : 'px-3 py-1.5 text-sm rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors'
      }
    >
      {children}
    </button>
  )
}

/**
 * Preset chips for the common ranges, plus "Custom" for anything else. The
 * chips are only shortcuts: `value` is always a plain range, and whichever
 * preset equals it lights up — however it was entered.
 */
export function RangeFilter({ label, presets, value, onChange }: RangeFilterProps) {
  const t = useTranslations('recipes')
  const [customOpen, setCustomOpen] = useState(false)
  const activePreset = presetFor(value, presets)
  // A range no preset describes can only have come from the inputs, so they
  // stay visible for it — including after the modal is closed and reopened.
  const showCustom = customOpen || (value !== null && !activePreset)

  function selectPreset(preset: RangePreset) {
    setCustomOpen(false)
    onChange(activePreset === preset ? null : preset.range)
  }

  function toggleCustom() {
    if (!showCustom) {
      setCustomOpen(true)
      return
    }
    setCustomOpen(false)
    if (!activePreset) onChange(null)
  }

  function setBound(side: 'min' | 'max', raw: string) {
    const next: Range = { min: value?.min ?? null, max: value?.max ?? null, [side]: parseBound(raw) }
    onChange(next.min === null && next.max === null ? null : next)
  }

  const inputClass =
    'w-20 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300'

  return (
    <div role="group" aria-label={label}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Chip key={preset.label} active={activePreset === preset} onClick={() => selectPreset(preset)}>
            {preset.label}
          </Chip>
        ))}
        <Chip active={showCustom && !activePreset} onClick={toggleCustom}>
          {t('filtersModal.custom')}
        </Chip>
      </div>
      {showCustom && (
        <div className="flex items-center gap-2 mt-3">
          <input
            type="text"
            inputMode="numeric"
            aria-label={`${label}: ${t('filtersModal.from')}`}
            placeholder={t('filtersModal.from')}
            value={value?.min ?? ''}
            onChange={(e) => setBound('min', e.target.value)}
            className={inputClass}
          />
          <span className="text-gray-400">–</span>
          <input
            type="text"
            inputMode="numeric"
            aria-label={`${label}: ${t('filtersModal.to')}`}
            placeholder={t('filtersModal.to')}
            value={value?.max ?? ''}
            onChange={(e) => setBound('max', e.target.value)}
            className={inputClass}
          />
        </div>
      )}
    </div>
  )
}
