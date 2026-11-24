// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { collapseWhitespace, extractArticleContent, htmlToText } from './readability'

const URL = 'https://example.com/grandmas-apple-pie'

const ARTICLE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head><title>Grandma's Apple Pie</title></head>
<body>
<nav><a href="/">Home</a><a href="/about">About</a></nav>
<article>
<h1>Grandma's Apple Pie</h1>
<p>This is my grandmother's classic apple pie recipe, passed down for three generations in our family. It strikes the perfect balance of sweet and tart, with a flaky, buttery crust that never fails to impress guests at every holiday gathering we host.</p>
<h2>Ingredients</h2>
<ul>
<li>6 cups thinly sliced apples</li>
<li>3/4 cup white sugar</li>
<li>2 tablespoons all-purpose flour</li>
<li>1 teaspoon ground cinnamon</li>
<li>1/4 teaspoon ground nutmeg</li>
<li>1 recipe pastry for a 9 inch double crust pie</li>
</ul>
<h2>Instructions</h2>
<ol>
<li>Preheat oven to 425 degrees F (220 degrees C).</li>
<li>In a large bowl, combine apples, sugar, flour, cinnamon and nutmeg, and toss gently to coat evenly.</li>
<li>Line a 9 inch pie pan with the bottom crust, then fill with the apple mixture.</li>
<li>Cover with the top crust, seal the edges, and cut a few slits for steam to escape.</li>
<li>Bake for 45 minutes, or until the crust is golden brown and the filling is bubbly.</li>
</ol>
</article>
<footer>Copyright 2024 Grandma's Kitchen Blog</footer>
</body>
</html>
`

const NON_ARTICLE_HTML = `
<!DOCTYPE html>
<html><head><title>Category Page</title></head>
<body><nav><a href="/">Home</a></nav><footer>Copyright 2024</footer></body></html>
`

// Readability recognizes both of these as article candidates and returns non-null
// for both (verified: extracted textContent is 74 and 234 chars respectively) — the
// CHAR_THRESHOLD floor check inside extractArticleContent is what rejects the short one.
const SHORT_ARTICLE_HTML = `
<!DOCTYPE html>
<html><head><title>Quick Soup</title></head>
<body>
<nav><a href="/">Home</a></nav>
<article>
<h1>Quick Soup</h1>
<p>A quick weeknight soup with just five ingredients and ten minutes of prep.</p>
</article>
<footer>Copyright 2024</footer>
</body></html>
`

const LONG_ARTICLE_HTML = `
<!DOCTYPE html>
<html><head><title>Quick Soup</title></head>
<body>
<nav><a href="/">Home</a></nav>
<article>
<h1>Quick Soup</h1>
<p>A quick weeknight soup with just five ingredients and ten minutes of prep. It comes together in one pot, uses pantry staples you already have, and reheats beautifully for lunch the next day without losing any of its flavor or texture.</p>
</article>
<footer>Copyright 2024</footer>
</body></html>
`

// Shaped like a real WordPress recipe post (gymbeam.sk): the ingredient list sits
// in a block-editor columns block next to a photo. Readability's default
// "clean conditionally" pass dropped that block as link-heavy clutter (several
// ingredients link to the shop), so the
// model got the steps but no ingredients.
const COLUMNS_RECIPE_HTML = `
<!DOCTYPE html>
<html lang="sk"><head><title>Zemiaková polievka so strateným vajcom</title></head>
<body>
<nav><a href="/">Domov</a><a href="/blog">Blog</a></nav>
<article class="post">
<h1>Zemiaková polievka so strateným vajcom</h1>
<div class="entry-content">
<p>Hľadáte sýtu a chutnú polievku, ktorú zvládnete ľahko uvariť? Táto krémová zemiaková polievka s fazuľou a strateným vajcom vás spoľahlivo zahreje počas chladnejšieho počasia.</p>
<p>Vďaka bielej fazuli a stratenému vajcu obsahuje bielkoviny, zatiaľ čo koreňová zelenina dodá telu potrebné živiny. Jej príprava je jednoduchá a zvládne ju aj začiatočník.</p>
<div class="wp-block-columns">
<div class="wp-block-column">
<h3>Na polievku budeme potrebovať:</h3>
<ul class="wp-block-list">
<li>1 l zeleninového vývaru (dá sa nahradiť <a href="/vyvar">hovädzím vývarom</a>)</li>
<li>600 g zemiakov</li>
<li>240 g bielej fazule</li>
<li>100 ml smotany na varenie</li>
<li>2 mrkvy</li>
<li>1 pór</li>
<li>1 PL <a href="/olivovy-olej">olivového oleja</a></li>
<li>1 ČL <a href="/cesnak">sušeného cesnaku</a></li>
<li>½ ČL <a href="/paprika">mletej papriky</a></li>
<li><a href="/korenie">mleté čierne korenie podľa chuti</a></li>
<li><a href="/sol">soľ</a> podľa chuti</li>
</ul>
<div style="height:20px" aria-hidden="true" class="wp-block-spacer"></div>
<h3>Na podávanie budeme potrebovať:</h3>
<ul class="wp-block-list">
<li>5 vajec</li>
<li>čerstvý kôpor</li>
</ul>
</div>
<div class="wp-block-column"><figure><img src="/polievka.jpg" alt=""></figure></div>
</div>
<h3>Postup:</h3>
<p>V hrnci rozohrejeme olivový olej a opečieme na ňom nadrobno nakrájaný pór. Keď pór zmäkne, pridáme mrkvu a na kocky nakrájané zemiaky.</p>
<p>Všetko zalejeme vývarom a varíme približne 20 minút, kým zemiaky nezmäknú. Potom pridáme smotanu a fazuľu a polievku rozmixujeme.</p>
<p>Podávame so strateným vajcom a čerstvým kôprom.</p>
</div>
</article>
<footer>Copyright 2026</footer>
</body></html>
`

describe('extractArticleContent', () => {
  it('extracts title and text content from a blog article', () => {
    const result = extractArticleContent(ARTICLE_HTML, URL)
    expect(result).not.toBeNull()
    expect(result!.title).toContain('Apple Pie')
    expect(result!.textContent).toContain('6 cups thinly sliced apples')
    expect(result!.textContent).toContain('Preheat oven to 425 degrees F')
  })

  it('keeps an ingredient list that sits in a columns block beside a photo', () => {
    const result = extractArticleContent(COLUMNS_RECIPE_HTML, 'https://example.com/polievka')
    expect(result!.textContent).toContain('600 g zemiakov')
    expect(result!.textContent).toContain('1 pór')
    expect(result!.textContent).toContain('Podávame so strateným vajcom')
  })

  it('collapses indentation whitespace but keeps one line per list item', () => {
    const html = ARTICLE_HTML.replace(/<li>/g, '\n\t\t\t\t\t\t\t\t<li>          ')
    const text = extractArticleContent(html, URL)!.textContent
    expect(text).not.toMatch(/[ \t]{2,}|\n\s*\n/)
    expect(text).toContain('\n6 cups thinly sliced apples\n3/4 cup white sugar\n')
  })

  it('returns null when the page has no identifiable article content', () => {
    const result = extractArticleContent(NON_ARTICLE_HTML, URL)
    expect(result).toBeNull()
  })

  it('returns null when extracted content is clearly under CHAR_THRESHOLD', () => {
    const result = extractArticleContent(SHORT_ARTICLE_HTML, URL)
    expect(result).toBeNull()
  })

  it('returns non-null when extracted content is clearly over CHAR_THRESHOLD', () => {
    const result = extractArticleContent(LONG_ARTICLE_HTML, URL)
    expect(result).not.toBeNull()
    expect(result!.textContent.length).toBeGreaterThan(200)
  })
})

describe('htmlToText', () => {
  it('puts list items written without whitespace on their own lines', () => {
    const text = collapseWhitespace(htmlToText(
      '<p>For Risotto:</p><ul><li>2 tablespoons olive oil</li><li>7 cups vegetable broth</li><li>¾ cup diced shallots</li></ul>'
    ))
    expect(text).toBe('For Risotto:\n2 tablespoons olive oil\n7 cups vegetable broth\n¾ cup diced shallots')
  })

  it('keeps a table row on one line and breaks between rows and at <br>', () => {
    const text = collapseWhitespace(htmlToText(
      '<table><tr><td>800 g</td><td>panenka bravčová</td></tr><tr><td>4</td><td>strúčiky cesnaku</td></tr></table>' +
      '<p>Rúru predhrejeme.<br>Pečieme 45 minút.</p>'
    ))
    expect(text).toBe('800 g panenka bravčová\n4 strúčiky cesnaku\nRúru predhrejeme.\nPečieme 45 minút.')
  })

  it('does not split inline elements inside a line', () => {
    expect(collapseWhitespace(htmlToText('<li>1 PL <a href="/olej">olivového oleja</a> a <strong>soľ</strong></li>')))
      .toBe('1 PL olivového oleja a soľ')
  })
})

describe('collapseWhitespace', () => {
  it('turns runs of spaces, tabs and blank lines into single separators', () => {
    expect(collapseWhitespace('  \n\t\tSuroviny \r\n\n\n   200 g   múky\u00a0\n\t \n Postup  '))
      .toBe('Suroviny\n200 g múky\nPostup')
  })
})

describe('extractArticleContent dependencies — Vercel compatibility', () => {
  // Vercel's Node.js serverless function runtime unconditionally passes
  // --no-experimental-require-module, disabling require() of ES modules
  // regardless of the selected Node.js version (confirmed via Vercel community
  // reports; this is NOT fixed by bumping engines.node). jsdom (v26+) fails this
  // because it requires the ESM-only @exodus/bytes package from several of its
  // own core files. This test reproduces that exact restriction locally and
  // would have caught that regression — and would catch it again if a future
  // dependency bump (linkedom or otherwise) reintroduces a synchronous require()
  // of an ES module anywhere in this module's dependency chain.
  it('requires cleanly with Node ESM-require support disabled', () => {
    const script = `
      const { parseHTML } = require('linkedom');
      const { Readability } = require('@mozilla/readability');
      const { document } = parseHTML(
        '<html><body><article><h1>Test</h1><p>' +
        'This is a long enough paragraph of article text for Readability to ' +
        'recognize it as real content worth extracting, rather than discarding it.' +
        '</p></article></body></html>'
      );
      const article = new Readability(document).parse();
      if (!article || !article.textContent.includes('Readability')) {
        throw new Error('extraction did not produce expected content');
      }
      console.log('OK');
    `

    const result = execFileSync(process.execPath, ['--no-require-module', '-e', script], {
      encoding: 'utf-8',
      cwd: process.cwd(),
    })

    expect(result.trim()).toBe('OK')
  })
})
