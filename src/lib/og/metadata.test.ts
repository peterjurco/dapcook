import { describe, expect, it } from 'vitest'
import { inviteMetadata, sharedRecipeMetadata } from './metadata'

describe('sharedRecipeMetadata', () => {
  it('uses the recipe name and description', () => {
    const metadata = sharedRecipeMetadata({ title: 'Lentil soup', description: ' Warming. ' })

    expect(metadata.title).toBe('Lentil soup | dapcook')
    expect(metadata.description).toBe('Warming.')
    expect(metadata.openGraph).toMatchObject({ title: 'Lentil soup', description: 'Warming.', siteName: 'dapcook' })
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('falls back to a generic description', () => {
    expect(sharedRecipeMetadata({ title: 'Soup', description: null }).description).toBe('A recipe shared from dapcook')
  })

  it('clips long descriptions', () => {
    const description = sharedRecipeMetadata({ title: 'Soup', description: 'a'.repeat(500) }).description!

    expect(description).toHaveLength(200)
    expect(description.endsWith('…')).toBe(true)
  })

  it('keeps an unknown token generic and unindexed', () => {
    const metadata = sharedRecipeMetadata(null)

    expect(metadata.title).toBe('Shared recipe | dapcook')
    expect(metadata.openGraph).toBeUndefined()
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})

describe('inviteMetadata', () => {
  it('names the household', () => {
    const metadata = inviteMetadata({ name: "Jurčo's kitchen" })

    expect(metadata.title).toBe("Join Jurčo's kitchen on dapcook")
    expect(metadata.openGraph).toMatchObject({ title: "Join Jurčo's kitchen on dapcook" })
  })

  it('falls back to the app for an invalid invite', () => {
    expect(inviteMetadata(null)).toEqual({ title: 'dapcook' })
  })
})
