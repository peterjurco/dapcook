// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseJsonLd } from './jsonld'

const URL = 'https://example.com/recipe'

function scripts(recipe: unknown): string[] {
  return [JSON.stringify(recipe)]
}

describe('parseJsonLd', () => {
  // ── null cases ────────────────────────────────────────────────────────────

  it('returns null for empty script list', () => {
    expect(parseJsonLd([], URL)).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(parseJsonLd(['{not json}'], URL)).toBeNull()
  })

  it('returns null when no Recipe type present', () => {
    expect(parseJsonLd(scripts({ '@type': 'Article', name: 'foo' }), URL)).toBeNull()
  })

  // ── basic Recipe ──────────────────────────────────────────────────────────

  it('parses a minimal Recipe object', () => {
    const result = parseJsonLd(scripts({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Test Cake',
      description: 'A tasty test cake',
      recipeIngredient: ['200g flour', '2 eggs'],
      recipeInstructions: ['Mix ingredients', 'Bake at 180°C for 30 minutes'],
    }), URL)

    expect(result).not.toBeNull()
    expect(result!.title).toBe('Test Cake')
    expect(result!.description).toBe('A tasty test cake')
    expect(result!.source_url).toBe(URL)
    expect(result!.rawIngredients).toEqual(['200g flour', '2 eggs'])
    expect(result!.rawSteps).toEqual(['Mix ingredients', 'Bake at 180°C for 30 minutes'])
    expect(result!.partial).toBe(false)
  })

  it('uses "Untitled Recipe" when name is missing', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe' }), URL)
    expect(result!.title).toBe('Untitled Recipe')
  })

  // ── duration parsing ──────────────────────────────────────────────────────

  it('parses PT30M → 30 minutes', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T', prepTime: 'PT30M' }), URL)
    expect(result!.prep_time_min).toBe(30)
  })

  it('parses PT1H → 60 minutes', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T', cookTime: 'PT1H' }), URL)
    expect(result!.cook_time_min).toBe(60)
  })

  it('parses PT1H30M → 90 minutes', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T', cookTime: 'PT1H30M' }), URL)
    expect(result!.cook_time_min).toBe(90)
  })

  it('parses PT2H15M → 135 minutes', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T', cookTime: 'PT2H15M' }), URL)
    expect(result!.cook_time_min).toBe(135)
  })

  it('returns null for missing duration', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T' }), URL)
    expect(result!.prep_time_min).toBeNull()
    expect(result!.cook_time_min).toBeNull()
  })

  // ── yield / servings parsing ──────────────────────────────────────────────

  it('parses numeric yield', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T', recipeYield: 4 }), URL)
    expect(result!.servings).toBe(4)
  })

  it('parses "4 servings"', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T', recipeYield: '4 servings' }), URL)
    expect(result!.servings).toBe(4)
  })

  it('parses "Serves 2"', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T', recipeYield: 'Serves 2' }), URL)
    expect(result!.servings).toBe(2)
  })

  it('parses yield array like ["4 servings"]', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T', recipeYield: ['4 servings'] }), URL)
    expect(result!.servings).toBe(4)
  })

  it('returns null for missing yield', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T' }), URL)
    expect(result!.servings).toBeNull()
  })

  // ── image parsing ─────────────────────────────────────────────────────────

  it('parses image as plain string', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T', image: 'https://example.com/img.jpg' }), URL)
    expect(result!.image_url).toBe('https://example.com/img.jpg')
  })

  it('parses image as ImageObject', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      image: { '@type': 'ImageObject', url: 'https://example.com/img.jpg' },
    }), URL)
    expect(result!.image_url).toBe('https://example.com/img.jpg')
  })

  it('parses image as array of ImageObjects — takes first', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      image: [
        { '@type': 'ImageObject', url: 'https://example.com/img-768.jpg', width: 768 },
        { '@type': 'ImageObject', url: 'https://example.com/img-900.jpg', width: 900 },
      ],
    }), URL)
    expect(result!.image_url).toBe('https://example.com/img-768.jpg')
  })

  it('returns null for missing image', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T' }), URL)
    expect(result!.image_url).toBeNull()
  })

  // ── instruction formats ───────────────────────────────────────────────────

  it('parses instructions as plain strings', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      recipeInstructions: ['Step one.', 'Step two.'],
    }), URL)
    expect(result!.rawSteps).toEqual(['Step one.', 'Step two.'])
  })

  it('parses HowToStep objects', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Heat the oil.' },
        { '@type': 'HowToStep', text: 'Add the onion.' },
      ],
    }), URL)
    expect(result!.rawSteps).toEqual(['Heat the oil.', 'Add the onion.'])
  })

  it('flattens HowToSection with nested HowToStep items', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'For the sauce',
          itemListElement: [
            { '@type': 'HowToStep', text: 'Chop tomatoes.' },
            { '@type': 'HowToStep', text: 'Simmer for 10 minutes.' },
          ],
        },
        { '@type': 'HowToStep', text: 'Serve hot.' },
      ],
    }), URL)
    expect(result!.rawSteps).toEqual(['Chop tomatoes.', 'Simmer for 10 minutes.', 'Serve hot.'])
  })

  // ── tags / keywords ───────────────────────────────────────────────────────

  it('parses comma-separated keywords string', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      keywords: 'Vegan, Quick, Healthy',
    }), URL)
    expect(result!.tags).toEqual(['vegan', 'quick', 'healthy'])
  })

  it('lowercases tags', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T', keywords: 'MEAT, Fish' }), URL)
    expect(result!.tags).toEqual(['meat', 'fish'])
  })

  it('caps tags at 10', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      keywords: 'a,b,c,d,e,f,g,h,i,j,k,l',
    }), URL)
    expect(result!.tags.length).toBe(10)
  })

  // ── Recipe discovery ──────────────────────────────────────────────────────

  it('finds Recipe inside a JSON-LD array', () => {
    const result = parseJsonLd(scripts([
      { '@type': 'WebSite', name: 'Site' },
      { '@type': 'Recipe', name: 'Array Recipe', recipeIngredient: ['1 egg'] },
    ]), URL)
    expect(result!.title).toBe('Array Recipe')
    expect(result!.rawIngredients).toEqual(['1 egg'])
  })

  it('finds Recipe inside @graph', () => {
    const result = parseJsonLd(scripts({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Page' },
        { '@type': 'Recipe', name: 'Graph Recipe', recipeIngredient: ['200ml milk'] },
      ],
    }), URL)
    expect(result!.title).toBe('Graph Recipe')
    expect(result!.rawIngredients).toEqual(['200ml milk'])
  })

  it('searches multiple script blocks and finds the Recipe', () => {
    const result = parseJsonLd([
      JSON.stringify({ '@type': 'WebSite', name: 'Site' }),
      JSON.stringify({ '@type': 'Recipe', name: 'Second Block Recipe' }),
    ], URL)
    expect(result!.title).toBe('Second Block Recipe')
  })

  // ── string ingredient / instruction fields (e.g. kuchynalidla.sk) ────────

  it('parses recipeIngredient as a newline-delimited string', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      recipeIngredient: '\r\n\t800 g flour\r\n\t2 eggs\r\n\t100 ml milk\r\n',
    }), URL)
    expect(result!.rawIngredients).toEqual(['800 g flour', '2 eggs', '100 ml milk'])
  })

  it('decodes HTML entities in string ingredients', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      recipeIngredient: '\r\n\tbravčov&yacute; vý&scaron;ok\r\n\t2 cibule\r\n',
    }), URL)
    expect(result!.rawIngredients[0]).toBe('bravčový výšok')
  })

  it('parses recipeInstructions as a plain string (splits on double newlines)', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      recipeInstructions: 'V hrnci rozohrejte olej a opečte cibuľu.\r\n\r\nPridajte mäso a duste 20 minút.\r\n\r\nPodávajte s chlebom.',
    }), URL)
    expect(result!.rawSteps.length).toBe(3)
    expect(result!.rawSteps[0]).toBe('V hrnci rozohrejte olej a opečte cibuľu.')
  })

  it('decodes HTML entities in string instructions', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      recipeInstructions: 'Pridajte nakr&aacute;jan&yacute; cesnak.\r\n\r\nDuste 10 min&uacute;t.',
    }), URL)
    expect(result!.rawSteps[0]).toBe('Pridajte nakrájaný cesnak.')
  })

  // ── partial flag ──────────────────────────────────────────────────────────

  it('sets partial=true when both ingredients and steps are missing', () => {
    const result = parseJsonLd(scripts({ '@type': 'Recipe', name: 'T' }), URL)
    expect(result!.partial).toBe(true)
  })

  it('sets partial=true when steps are missing even if ingredients are present', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      recipeIngredient: ['1 egg'],
    }), URL)
    expect(result!.partial).toBe(true)
  })

  it('sets partial=true when ingredients are missing even if steps are present', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      recipeInstructions: ['Boil it'],
    }), URL)
    expect(result!.partial).toBe(true)
  })

  it('sets partial=false when both ingredients and steps are present', () => {
    const result = parseJsonLd(scripts({
      '@type': 'Recipe', name: 'T',
      recipeIngredient: ['1 egg'],
      recipeInstructions: ['Boil it'],
    }), URL)
    expect(result!.partial).toBe(false)
  })
})
