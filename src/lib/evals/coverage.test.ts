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

  it('matches lines worded a little differently from the page (delish.com, hellolittlehome.com)', () => {
    const text = 'Ingredients\n3/4 cup low-sodium chicken broth\n¾ cup diced shallots (about 2 large)\n1 ½ cups arborio rice\nKosher salt'
    expect(coverage(['3/4 c. low-sodium chicken broth', '3/4 cup diced shallots ((about 2 large))', '1 1/2 cups arborio rice', 'Kosher salt'], text))
      .toEqual({ total: 4, found: 4, missing: [] })
  })

  it('still requires short lines to match exactly, and the words of a line to be close together', () => {
    const text = 'Season with salt. ' + 'Filler words about the weather and the garden. '.repeat(10) + 'Add the chicken broth.'
    expect(coverage(['pepper', 'salt chicken broth'], text).missing).toEqual(['pepper', 'salt chicken broth'])
  })

  it('flags an input only when more than 10% of a list is missing', () => {
    const steps = [
      'Heat the oil in a large skillet', 'Add the shallots and garlic', 'Stir in the arborio rice',
      'Pour in the white wine', 'Add one cup of warm broth', 'Keep stirring until absorbed',
      'Preheat the oven for tomatoes', 'Toss tomatoes with olive oil', 'Roast tomatoes until blistered',
      'Fold in pesto and parmesan', 'Season risotto with salt', 'Spoon tomatoes over the top',
      'Serve with extra cheese',
    ]
    const reference = { source: 'JSON-LD', data: { rawIngredients: [], rawSteps: steps } }
    expect(detectInputProblem(steps.slice(0, 12).join('\n'), reference)).toBeNull()
    expect(detectInputProblem(steps.slice(0, 8).join('\n'), reference))
      .toBe("The article text is missing 5 of 13 steps from the page's JSON-LD.")
  })

  it('ignores blank lines', () => {
    expect(coverage(['', '  '], 'anything')).toEqual({ total: 0, found: 0, missing: [] })
  })
})
