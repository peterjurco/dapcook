import { describe, it, expect } from 'vitest'
import { matchWords, scoreIngredients, scoreStepCompleteness } from './scoring'

describe('matchWords', () => {
  it('ignores case, whitespace and punctuation, and unifies fractions', () => {
    expect(matchWords('  ¾ Cup  flour, sifted. ')).toEqual(matchWords('3/4 cup flour sifted'))
    expect(matchWords('1½ cups rice')).toEqual(matchWords('1 1/2 cups rice'))
    expect(matchWords('1⁄2 tsp salt')).toEqual(matchWords('½ tsp salt'))
  })

  it('keeps different numbers apart', () => {
    expect(matchWords('12 eggs')).not.toEqual(matchWords('1/2 eggs'))
  })
})

describe('scoreIngredients', () => {
  it('passes the same lines in any order, ignoring case, spacing, punctuation and fraction style', () => {
    expect(scoreIngredients(['200 g flour', '½ tsp salt', 'Salt, to taste'], ['salt to taste', '1/2 tsp salt', '200g flour'.replace('g', ' g')]))
      .toEqual({ pass: true, missing: [], extra: [] })
  })

  it('reports missing and extra lines, in their own wording', () => {
    expect(scoreIngredients(['2 eggs', '1 cup milk'], ['2 Eggs', '1 cup water']))
      .toEqual({ pass: false, missing: ['1 cup milk'], extra: ['1 cup water'] })
  })

  it('counts duplicates: a line expected once but output twice is extra', () => {
    const result = scoreIngredients(['salt'], ['Salt', 'salt.'])
    expect(result).toMatchObject({ pass: false, missing: [] })
    expect(result.extra).toHaveLength(1)
  })

  it('does not accept a partial line', () => {
    expect(scoreIngredients(['200 g flour, sifted'], ['200 g flour']).pass).toBe(false)
  })
})

describe('scoreStepCompleteness', () => {
  const expected = ['Preheat the oven to 200 °C.', 'Mix the flour with the eggs, then bake for 20 minutes.']

  it('passes the same content split into steps differently', () => {
    expect(scoreStepCompleteness(expected, ['Preheat the oven to 200°C. Mix the flour with the eggs,', 'then bake for 20 minutes']))
      .toEqual({ pass: true, missing: [], extra: [] })
  })

  it('reports a missing passage and an added one', () => {
    const result = scoreStepCompleteness(expected, ['Preheat the oven to 200 °C.', 'Mix the flour with the eggs.', 'Serve warm.'])
    expect(result.pass).toBe(false)
    expect(result.missing).toEqual(['then bake for 20 minutes'])
    expect(result.extra).toEqual(['serve warm'])
  })

  it('reports a changed word as one missing and one extra word', () => {
    const result = scoreStepCompleteness(['Bake for 20 minutes.'], ['Bake for 25 minutes.'])
    expect(result).toEqual({ pass: false, missing: ['20'], extra: ['25'] })
  })

  it('fails empty output against expected steps', () => {
    expect(scoreStepCompleteness(expected, []).missing).toHaveLength(1)
  })
})
