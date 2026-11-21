import { describe, it, expect } from 'vitest'
import { coverage, detectInputProblem } from './coverage'

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

  it('describes what the input is missing, or returns null when it is complete', () => {
    const reference = { source: 'JSON-LD', data: { rawIngredients: ['500 g panenky', '1 vajce'], rawSteps: ['Opečieme.'] } }
    expect(detectInputProblem('Opečieme.', reference))
      .toBe("The article text is missing 2 of 2 ingredients from the page's JSON-LD.")
    expect(detectInputProblem('500 g panenky, 1 vajce. Opečieme.', reference)).toBeNull()
    expect(detectInputProblem('anything', null)).toBeNull()
  })

  it('ignores blank lines', () => {
    expect(coverage(['', '  '], 'anything')).toEqual({ total: 0, found: 0, missing: [] })
  })
})
