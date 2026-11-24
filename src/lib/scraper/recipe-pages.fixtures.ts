// Synthetic recipe pages for recipe-pages.test.ts. Each one copies the HTML
// structure of a real site where the importer's article text lost part of the
// recipe (tags, nesting, class names, link density, sizes), but every word is
// our own: the real pages are third-party content and stay out of the repo.
//
// Each page was checked to fail on the original pipeline (Readability defaults,
// textContent, 6,000-char cap) in the same way as the real page, and to pass now.

export interface RecipePageCase {
  site: string
  /** What used to go wrong on the real page. */
  problem: string
  html: string
  /** Lines that must reach the model, each as a line of its own. */
  ingredients: string[]
  steps: string[]
}

const page = (title: string, body: string) => `<!DOCTYPE html>
<html lang="sk"><head><title>${title}</title></head>
<body>
<nav><a href="/">Domov</a><a href="/recepty">Recepty</a><a href="/kontakt">Kontakt</a></nav>
${body}
<footer><p>Copyright 2026</p><a href="/gdpr">Ochrana súkromia</a></footer>
</body></html>`

/** Paragraphs of filler prose, our own words, `count` long. */
const story = (count: number) =>
  Array.from(
    { length: count },
    (_, i) =>
      `<p>Paragraph ${i + 1} of the story: we tested this dish on a rainy weekend, adjusted the seasoning twice, ` +
      `and served it to friends who asked for seconds, which is why it finally made it onto the blog this week.</p>`
  ).join('\n')

// gymbeam.sk: ingredients in a block-editor columns block beside a photo, many
// of them linking to the shop. Readability's "clean conditionally" pass dropped
// the block as link-heavy clutter.
const gymbeam: RecipePageCase = {
  site: 'gymbeam.sk',
  problem: 'shop-linked ingredient list in a columns block was dropped as clutter',
  html: page('Zemiaková polievka so strateným vajcom', `
<article class="post"><h1>Zemiaková polievka so strateným vajcom</h1>
<div class="entry-content">
<p>Hľadáte sýtu polievku, ktorú zvládnete ľahko uvariť? Táto krémová zemiaková polievka s fazuľou vás spoľahlivo zahreje.</p>
<p>Vďaka fazuli a vajcu obsahuje bielkoviny a koreňová zelenina dodá telu živiny. Príprava je jednoduchá aj pre začiatočníka.</p>
<div class="wp-block-columns">
<div class="wp-block-column">
<h3>Na polievku budeme potrebovať:</h3>
<ul class="wp-block-list">
<li>1 l zeleninového vývaru (dá sa nahradiť <a href="/vyvar">hovädzím vývarom</a>)</li>
<li>600 g zemiakov</li><li>240 g bielej fazule</li><li>100 ml smotany na varenie</li><li>2 mrkvy</li><li>1 pór</li>
<li>1 PL <a href="/olivovy-olej">olivového oleja</a></li><li>1 ČL <a href="/cesnak">sušeného cesnaku</a></li>
<li>½ ČL <a href="/paprika">mletej papriky</a></li><li><a href="/korenie">mleté čierne korenie podľa chuti</a></li>
<li><a href="/sol">soľ</a> podľa chuti</li>
</ul>
</div>
<div class="wp-block-column"><figure><img src="/polievka.jpg" alt=""></figure></div>
</div>
<h3>Postup:</h3>
<p>V hrnci rozohrejeme olej a opečieme na ňom nadrobno nakrájaný pór, potom pridáme mrkvu a zemiaky.</p>
<p>Zalejeme vývarom a varíme približne 20 minút, kým zemiaky nezmäknú, potom pridáme smotanu a fazuľu.</p>
</div></article>`),
  ingredients: ['600 g zemiakov', '1 PL olivového oleja', 'soľ podľa chuti'],
  steps: ['Zalejeme vývarom a varíme približne 20 minút, kým zemiaky nezmäknú, potom pridáme smotanu a fazuľu.'],
}

// tinkinerecepty.sk: a WP Ultimate Recipe box of nested rows where every
// ingredient name links to an ingredient page. Dropped as link-heavy clutter.
const tinkinerecepty: RecipePageCase = {
  site: 'tinkinerecepty.sk',
  problem: 'recipe-plugin ingredient rows with every name linked were dropped as clutter',
  html: page('Panenka so zeleninovým špízom', `
<article class="post recipe type-recipe"><h1>Panenka so zeleninovým špízom</h1>
<div class="entry-content">
<p>Výborné, jednoduché a chutné jedlo na špeciálnu príležitosť, ktoré zvládnete aj vo všedný deň za necelú hodinu.</p>
<p>Mäso zabalené v šunke ostane šťavnaté a zelenina z rúry k nemu chuťou aj farbou perfektne ladí.</p>
<div class="wpurp-container"><div class="wpurp-rows">
<div class="wpurp-rows-row"><div class="wpurp-rows">
<div class="wpurp-rows-row"><span class="wpurp-title">Čo budeme potrebovať</span></div>
<div class="wpurp-rows-row"><div class="wpurp-recipe-ingredients"><ul class="wpurp-recipe-ingredient-container">
${[['1', 'ks', 'bravčová panenka'], ['6', 'plátkov', 'sušená šunka'], ['2', 'PL', 'dijonská horčica'], ['1', 'ks', 'červená paprika'], ['1', 'ks', 'cuketa'], ['200', 'g', 'brusnice'], ['1', 'PL', 'med'], ['2', 'PL', 'olivový olej']]
  .map(([q, u, n], i) => `<li class="wpurp-recipe-ingredient"><span class="wpurp-box"> <span class="wpurp-recipe-ingredient-quantity">${q}</span> <span class="wpurp-recipe-ingredient-unit">${u}</span></span> <span class="wpurp-box"> <span class="wpurp-recipe-ingredient-name"><a href="/ingredient/${i}">${n}</a></span></span></li>`).join('\n')}
</ul></div></div>
<div class="wpurp-rows-row"><span class="wpurp-box">Množstvo: 4 porcie</span></div>
</div></div>
<div class="wpurp-rows-row"><div class="wpurp-rows">
<div class="wpurp-rows-row"><span class="wpurp-title">Postup prípravy</span></div>
<div class="wpurp-rows-row"><div class="wpurp-recipe-instructions"><ol class="wpurp-recipe-instruction-container">
<li class="wpurp-recipe-instruction"><span class="wpurp-recipe-instruction-text">Zeleninu nakrájame, pokvapkáme olejom, napichneme na špízy a pečieme dvadsať minút.</span></li>
<li class="wpurp-recipe-instruction"><span class="wpurp-recipe-instruction-text">Panenku potrieme horčicou, zabalíme do šunky a opečieme zo všetkých strán.</span></li>
<li class="wpurp-recipe-instruction"><span class="wpurp-recipe-instruction-text">Brusnice povaríme s medom a podávame ako omáčku k mäsu a zelenine.</span></li>
</ol></div></div>
</div></div>
</div></div>
</div></article>`),
  ingredients: ['1 ks bravčová panenka', '6 plátkov sušená šunka', '2 PL olivový olej'],
  steps: ['Brusnice povaríme s medom a podávame ako omáčku k mäsu a zelenine.'],
}

// varecha.pravda.sk: ingredients in a table in one column, the steps in the
// next. Readability scores paragraphs, so the steps won and the ingredient
// column was left out.
const varecha: RecipePageCase = {
  site: 'varecha.pravda.sk',
  problem: 'ingredient table in a column next to the steps was left out',
  html: page('Bravčové medailóniky s cesnakovou omáčkou', `
<div class="recept-detail">
<h1>Bravčové medailóniky s cesnakovou omáčkou</h1>
<div class="recipe-description">Šťavnaté mäso s výraznou omáčkou, ktoré pripravíte za pár minút.</div>
<div class="row" id="rcpt_postup">
<div class="col suroviny col-12 col-sm-4"><h2>Suroviny</h2>
<table class="recipe-ingredients">
${[['800 g', 'panenka bravčová'], ['4 strúčiky', 'cesnak'], ['60 ml', 'olej'], ['1 PL', 'koňak'], ['50 g', 'maslo'], ['200 ml', 'smotana na varenie']]
  .map(([a, n]) => `<tr class="recipe-ingredients__row"><td class="recipe-ingredients__amount">${a}</td><td class="recipe-ingredients__ingredient">${n}</td></tr>`).join('\n')}
</table></div>
<div class="col postup col-12 col-sm-8"><h2>Postup</h2>
<ol class="recipe-instructions">
<li class="recipe-instruction"><div class="recipe-instruction__main"><p>Panenku očistíme, nakrájame na hrubšie plátky, mierne ich naklepeme, potrieme prelisovaným cesnakom, posolíme, okoreníme, pokvapkáme olejom a necháme aspoň pol hodiny marinovať v chlade.</p></div></li>
<li class="recipe-instruction"><div class="recipe-instruction__main"><p>Mäso opečieme na rozpálenom oleji z oboch strán, vyberieme a odložíme na teplé miesto.</p></div></li>
<li class="recipe-instruction"><div class="recipe-instruction__main"><p>Do výpeku pridáme koňak, maslo, cesnak a smotanu, krátko povaríme, podľa potreby dolejeme vývar, dobre premiešame, vrátime do omáčky mäso, prikryjeme a necháme ešte pár minút prejsť varom.</p></div></li>
<li class="recipe-instruction"><div class="recipe-instruction__main"><p>Nakoniec pridáme nasekanú petržlenovú vňať, omáčku ochutnáme, dosolíme, premiešame a podávame s cestovinami, ryžou, zemiakmi alebo len s čerstvým pečivom.</p></div></li>
</ol></div>
</div>
</div>`),
  ingredients: ['800 g panenka bravčová', '4 strúčiky cesnak', '200 ml smotana na varenie'],
  steps: ['Mäso opečieme na rozpálenom oleji z oboch strán, vyberieme a odložíme na teplé miesto.'],
}

// fitrecepty.sk: an intro block of paragraphs, and the recipe as bare lists in
// sibling blocks. The intro scored highest, so the lists were left out.
const fitrecepty: RecipePageCase = {
  site: 'fitrecepty.sk',
  problem: 'recipe written as bare lists beside an intro block was left out',
  html: page('Kuracie prsia z jednej panvice', `
<div class="recipeDetailLeft">
<div class="headingFlex"><h1>Kuracie prsia z jednej panvice</h1></div>
<div>
<p>Rýchla večera z jednej panvice, ktorá je hotová za necelú polhodinu a chutí celej rodine bez výnimky.</p>
<p>Spojenie kuracieho mäsa, špenátu a sušených paradajok si zamilujete a prenesie vás rovno do slnečného Talianska.</p>
<p>Pri tomto recepte sa veľa nenarobíte, pripravíte ho raz-dva v jednej panvici alebo vo woku.</p>
<p>Namiesto smotany použijeme syrokrém, vďaka ktorému ušetríme kalórie a omáčka bude ešte krémovejšia.</p>
<p>Podávame s ryžou, kuskusom alebo quinoou. Recept je skvelý aj do krabičky na obed do práce.</p>
</div>
<div class="recipeDetailIngredients"><h3>Suroviny</h3><ul>
<li>800 g kuracích pŕs</li><li>100 g sušených paradajok</li><li>100 g baby špenátu</li><li>50 g syrokrému light (cream cheese)</li>
<li>200 ml vody</li><li>1 cibuľa</li><li>2 strúčiky cesnaku</li><li>1 PL oleja (sezamový alebo olivový)</li>
</ul></div>
<div><h3>Postup</h3><ol>
<li>Kuracie prsia prekrojíme pozdĺžne na polovicu, aby sme dostali tenšie plátky.</li>
<li>Na rozohriatom oleji orestujeme nadrobno nakrájanú cibuľu do sklovita.</li>
<li>Pridáme kuracie prsia a restujeme ich približne tri minúty z každej strany.</li>
<li>Vrátime mäso do omáčky, prikryjeme a dusíme ešte päť minút.</li>
</ol></div>
<div class="SocialShare">Zdieľaj recept s priateľmi:</div>
</div>`),
  ingredients: ['800 g kuracích pŕs', '1 cibuľa', '1 PL oleja (sezamový alebo olivový)'],
  steps: ['Kuracie prsia prekrojíme pozdĺžne na polovicu, aby sme dostali tenšie plátky.', 'Vrátime mäso do omáčky, prikryjeme a dusíme ešte päť minút.'],
}

// delish.com: thousands of characters of story before the recipe card, which
// started past the old 6,000-char cap.
const delish: RecipePageCase = {
  site: 'delish.com',
  problem: 'recipe started after a long story, past the 6,000-char cap',
  html: page('Skillet Chicken', `
<article><h1>Skillet Chicken</h1>
<div class="article-body">
${story(30)}
<div class="recipe-card">
<h2>Ingredients</h2>
<div class="ingredients-body"><ul class="ingredient-lists">
<li>3 tbsp. olive oil, divided</li><li>4 boneless chicken breasts</li><li>2 garlic cloves, finely chopped</li><li>1/2 cup heavy cream</li>
</ul></div>
<h2>Directions</h2>
<ol class="directions">
<li><p>Season the chicken and sear it in a hot skillet until golden on both sides.</p></li>
<li><p>Stir in the garlic and cream, return the chicken and bake until cooked through.</p></li>
</ol>
</div>
</div></article>`),
  ingredients: ['4 boneless chicken breasts', '1/2 cup heavy cream'],
  steps: ['Stir in the garlic and cream, return the chicken and bake until cooked through.'],
}

/** Indents every line of `html` deeply, the way some templates render. */
const indent = (html: string) =>
  html.split('\n').map((line) => `\n${' '.repeat(200)}${line}\n${' '.repeat(200)}`).join('')

// themodernproper.com: deeply indented template output. textContent kept the
// indentation, so 68% of the article text was whitespace and the recipe fell
// past the cap.
const themodernproper: RecipePageCase = {
  site: 'themodernproper.com',
  problem: 'indentation whitespace pushed the recipe past the cap',
  html: page('Grilled Halloumi Salad', indent(`<article><h1>Grilled Halloumi Salad</h1>
<div class="post-content">
${story(25)}
<div class="recipe">
<h2>Ingredients</h2>
<ul>
<li>
1 cup panko breadcrumbs
</li>
<li>
8 ounces halloumi, sliced
</li>
<li>
1/4 cup sour cream
</li>
</ul>
<h2>Method</h2>
<ol>
<li>
<p>Toast the panko in butter until golden, then set it aside to cool.</p>
</li>
<li>
<p>Grill the halloumi until marked and serve it over the greens with the panko.</p>
</li>
</ol>
</div>
</div></article>`)),
  ingredients: ['1 cup panko breadcrumbs', '1/4 cup sour cream'],
  steps: ['Grill the halloumi until marked and serve it over the greens with the panko.'],
}

// hellolittlehome.com: a WP Recipe Maker card with no whitespace between its
// list items. textContent glued them: "olive oil7 cups vegetable broth".
const hellolittlehome: RecipePageCase = {
  site: 'hellolittlehome.com',
  problem: 'list items without whitespace between them were glued into one line',
  html: page('Pesto Risotto', `
<article><h1>Pesto Risotto</h1>
<div class="entry-content">
<p>A creamy risotto that pairs fresh pesto with blistered tomatoes, ready in about forty minutes on a weeknight.</p>
<p>Use short-grain rice and warm broth, and keep stirring: that is the whole secret to a silky risotto.</p>
<div class="wprm-recipe-container"><div class="wprm-recipe"><div class="wprm-recipe-ingredients-container"><h3>Ingredients</h3><ul class="wprm-recipe-ingredients"><li class="wprm-recipe-ingredient">2 tablespoons olive oil</li><li class="wprm-recipe-ingredient">7 cups vegetable broth</li><li class="wprm-recipe-ingredient">¾ cup diced shallots</li><li class="wprm-recipe-ingredient">1 ½ cups arborio rice</li></ul></div><div class="wprm-recipe-instructions-container"><h3>Instructions</h3><ul class="wprm-recipe-instructions"><li class="wprm-recipe-instruction">Sauté the shallots in oil until soft.</li><li class="wprm-recipe-instruction">Add the rice, then the broth one cup at a time, stirring until absorbed.</li></ul></div></div></div>
</div></article>`),
  ingredients: ['2 tablespoons olive oil', '7 cups vegetable broth', '¾ cup diced shallots'],
  steps: ['Sauté the shallots in oil until soft.', 'Add the rice, then the broth one cup at a time, stirring until absorbed.'],
}

export const RECIPE_PAGES: RecipePageCase[] = [
  gymbeam,
  tinkinerecepty,
  varecha,
  fitrecepty,
  delish,
  themodernproper,
  hellolittlehome,
]
