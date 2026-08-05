// @vitest-environment node
import { describe, it, expect } from 'vitest'
import packageJson from '../../../package.json'

describe('Node.js runtime requirement', () => {
  it('pins engines.node to a version with require(esm) support', () => {
    // jsdom (used by src/lib/scraper/readability.ts) requires the ESM-only
    // @exodus/bytes package from several of its own CJS files and from its own
    // dependencies (whatwg-url, whatwg-mimetype) — not just via one overridable
    // sub-dependency. require() of an ES module only works natively starting in
    // Node 22.12. On older runtimes this throws ERR_REQUIRE_ESM as soon as jsdom
    // is loaded (reproduced in production on Vercel, which defaults to an older
    // Node.js version without this field). If this assertion ever fails, either
    // restore a "22.x"+ engines.node pin, or stop depending on jsdom.
    const nodeEngine = packageJson.engines?.node
    expect(nodeEngine).toBeDefined()

    const major = parseInt(String(nodeEngine).match(/\d+/)?.[0] ?? '0', 10)
    expect(major).toBeGreaterThanOrEqual(22)
  })
})
