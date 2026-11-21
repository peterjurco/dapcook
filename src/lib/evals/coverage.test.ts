import { describe, it, expect } from 'vitest'
import { coverage } from './coverage'

describe('coverage', () => {
  it('finds lines even when Readability ran list items together', () => {
    const text = 'Suroviny6 jabĺk200 g hladkej múky\nPostupRúru predhrejeme na 180 °C.'
    expect(coverage(['6 jabĺk', '200 g hladkej múky', 'Rúru predhrejeme na 180 °C'], text))
      .toEqual({ total: 3, found: 3, missing: [] })
  })

  it('reports lines missing from the text', () => {
    const text = 'Panenku nakrájame na hrubšie medailóniky.'
    expect(coverage(['500 g bravčovej panenky', 'Panenku nakrájame na hrubšie medailóniky.'], text))
      .toEqual({ total: 2, found: 1, missing: ['500 g bravčovej panenky'] })
  })

  it('ignores blank lines', () => {
    expect(coverage(['', '  '], 'anything')).toEqual({ total: 0, found: 0, missing: [] })
  })
})
