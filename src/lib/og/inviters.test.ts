import { describe, expect, it } from 'vitest'
import { inviteLine } from './inviters'

describe('inviteLine', () => {
  it.each([
    [[], "You're invited to"],
    [[null, '  '], "You're invited to"],
    [['Peter'], 'Peter invites you to'],
    [['Peter', 'Mária'], 'Peter and Mária invite you to'],
    [['Peter', 'Mária', 'Janka'], 'Peter, Mária and Janka invite you to'],
    [['Peter', 'Mária', 'Janka', 'Ivo', 'Eva'], 'Peter, Mária, Janka and 2 others invite you to'],
    [['Peter', null, 'Janka'], 'Peter and Janka invite you to'],
  ])('%j → %s', (names, expected) => {
    expect(inviteLine(names)).toBe(expected)
  })
})
