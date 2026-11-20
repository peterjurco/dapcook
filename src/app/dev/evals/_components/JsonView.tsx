import { Fragment } from 'react'

/** "rawIngredients" → "Raw ingredients", "max_tokens" → "Max tokens" */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function Primitive({ value }: { value: string | number | boolean | null }) {
  if (value === null) return <span className="italic text-gray-400">null</span>
  if (typeof value === 'string') {
    return value === ''
      ? <span className="italic text-gray-400">empty string</span>
      : <span className="whitespace-pre-wrap break-words">{value}</span>
  }
  return <span className="font-mono text-sky-700">{String(value)}</span>
}

/**
 * Renders model JSON as a readable document: objects become labelled
 * sections, arrays numbered lists, so a recipe reads like a recipe.
 */
export function JsonView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (isPrimitive(value)) return <Primitive value={value} />
  if (value === undefined) return <span className="italic text-gray-400">undefined</span>

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">empty list</span>
    }
    return (
      <ol className="space-y-1">
        {value.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-6 shrink-0 select-none text-right font-mono text-xs leading-6 text-gray-400">{i + 1}</span>
            <div className={isPrimitive(item) ? 'min-w-0 leading-6' : 'min-w-0 flex-1 rounded border border-gray-200 p-2'}>
              <JsonView value={item} depth={depth + 1} />
            </div>
          </li>
        ))}
      </ol>
    )
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return <span className="italic text-gray-400">empty object</span>

  // Top level: one section per key. Nested: a compact two-column grid.
  if (depth === 0) {
    return (
      <div className="space-y-4">
        {entries.map(([key, v]) => (
          <section key={key}>
            <h4 className="mb-1.5 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {humanizeKey(key)}
              {Array.isArray(v) && <span className="font-normal normal-case text-gray-400">{v.length}</span>}
            </h4>
            <JsonView value={v} depth={depth + 1} />
          </section>
        ))}
      </div>
    )
  }

  return (
    <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-1">
      {entries.map(([key, v]) => (
        <Fragment key={key}>
          <dt className="text-xs leading-6 text-gray-500">{humanizeKey(key)}</dt>
          <dd className="min-w-0 leading-6"><JsonView value={v} depth={depth + 1} /></dd>
        </Fragment>
      ))}
    </dl>
  )
}
