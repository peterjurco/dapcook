import { describe, expect, it } from 'vitest'
import { targetTypeFor } from './TagOrganizer'

describe('targetTypeFor', () => {
  it('routes a tag drag to zone-type droppables', () => {
    // A tag can only be dropped into a DropZone (data: { type: 'zone' }).
    // No droppable is ever registered with type 'tag' — a naive
    // `=== dragType` comparison here matches nothing for every tag drag.
    expect(targetTypeFor('tag')).toBe('zone')
  })

  it('routes a group drag to group-type droppables', () => {
    // A group can only be dropped onto another group's sortable slot
    // (data: { type: 'group' }), for reordering.
    expect(targetTypeFor('group')).toBe('group')
  })

  it('defaults an unknown or missing drag type to zone', () => {
    expect(targetTypeFor(undefined)).toBe('zone')
    expect(targetTypeFor('something-else')).toBe('zone')
  })
})
