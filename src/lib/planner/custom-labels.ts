import { CUSTOM_LABELS } from '@/types/planner'

/**
 * Preset custom labels are stored in the database as their English string —
 * card styling, shopping-list filtering and existing rows all key off it — so
 * they are translated only when rendered. Labels the user typed themselves are
 * shown verbatim.
 */
const MESSAGE_KEYS: Record<string, string> = {
  Leftovers: 'leftovers',
  'Eating out': 'eatingOut',
  Takeaway: 'takeaway',
  Fasting: 'fasting',
}

export function isPresetLabel(label: string): boolean {
  return (CUSTOM_LABELS as readonly string[]).includes(label)
}

export function translateCustomLabel(label: string, t: (key: string) => string): string {
  const key = MESSAGE_KEYS[label]
  return key ? t(`customLabels.${key}`) : label
}
