// Caps cost on unusually long blog posts (long personal backstories,
// imperfectly-filtered related-post blocks, etc). Food blogs often put the recipe
// after several thousand characters of story (delish.com: ~7,200), so this has
// room for that; 12k chars is roughly 3k input tokens.
//
// Its own module, free of SDK and Next imports, so scripts can use it too
// (scripts/check-recipe-pages.ts).
export const MAX_ARTICLE_CHARS = 12_000
