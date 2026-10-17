import { describe, expect, it } from 'vitest'
import { siteUrl } from './site-url'

const env = (vars: Record<string, string>) => vars as NodeJS.ProcessEnv

describe('siteUrl', () => {
  it('uses the production alias in production', () => {
    expect(siteUrl(env({ VERCEL_ENV: 'production', VERCEL_URL: 'dapcook-abc.vercel.app' }))).toBe('https://dapcook.vercel.app')
  })

  it('uses the staging alias for the staging branch', () => {
    expect(siteUrl(env({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'staging', VERCEL_BRANCH_URL: 'x.vercel.app' }))).toBe(
      'https://dapcook-staging.vercel.app'
    )
  })

  it('uses the branch URL for other previews', () => {
    expect(siteUrl(env({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'dapcook-git-feat.vercel.app' }))).toBe(
      'https://dapcook-git-feat.vercel.app'
    )
  })

  it('falls back to localhost', () => {
    expect(siteUrl(env({}))).toBe('http://localhost:3000')
    expect(siteUrl(env({ PORT: '4000' }))).toBe('http://localhost:4000')
  })
})
