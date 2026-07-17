import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      { userAgent: 'GPTBot', disallow: '/s/' },
      { userAgent: 'OAI-SearchBot', disallow: '/s/' },
      { userAgent: 'ClaudeBot', disallow: '/s/' },
      { userAgent: 'Claude-SearchBot', disallow: '/s/' },
      { userAgent: 'ChatGPT-User', allow: '/' },
      { userAgent: 'Claude-User', allow: '/' },
    ],
  }
}
