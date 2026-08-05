// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { extractArticleContent } from './readability'

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

describe('extractArticleContent', () => {
  it('extracts title and text content from a blog article', () => {
    const result = extractArticleContent(ARTICLE_HTML, URL)
    expect(result).not.toBeNull()
    expect(result!.title).toContain('Apple Pie')
    expect(result!.textContent).toContain('6 cups thinly sliced apples')
    expect(result!.textContent).toContain('Preheat oven to 425 degrees F')
  })

  it('returns null when the page has no identifiable article content', () => {
    const result = extractArticleContent(NON_ARTICLE_HTML, URL)
    expect(result).toBeNull()
  })
})
