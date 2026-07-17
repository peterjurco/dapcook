import { describe, expect, it } from 'vitest'
import robots from './robots'

function getRules() {
  const output = robots()
  return Array.isArray(output.rules) ? output.rules : [output.rules]
}

describe('robots', () => {
  it('blocks autonomous AI crawlers from shared recipes', () => {
    const rules = getRules()

    for (const userAgent of [
      'GPTBot',
      'OAI-SearchBot',
      'ClaudeBot',
      'Claude-SearchBot',
    ]) {
      expect(rules).toContainEqual({ userAgent, disallow: '/s/' })
    }
  })

  it('allows user-directed chatbot fetchers', () => {
    const rules = getRules()

    expect(rules).toContainEqual({ userAgent: 'ChatGPT-User', allow: '/' })
    expect(rules).toContainEqual({ userAgent: 'Claude-User', allow: '/' })
  })

  it('allows ordinary crawlers to fetch pages', () => {
    const rules = getRules()

    expect(rules).toContainEqual({ userAgent: '*', allow: '/' })
  })
})
