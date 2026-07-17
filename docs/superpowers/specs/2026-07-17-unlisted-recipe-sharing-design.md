# Unlisted Recipe Sharing — Design Spec

## Overview

Allow a household member to opt a recipe into anonymous, read-only sharing through an unguessable URL. Anyone with the URL can view the current recipe, while revoked and superseded URLs stop working immediately.

Shared recipes must not be indexed by search engines or autonomous AI search/training crawlers. User-directed chatbot fetchers must remain able to read a URL pasted into a conversation. These controls apply only to compliant crawlers; an anonymous scraper impersonating a normal browser cannot be distinguished from a legitimate viewer.

## Data Model

Add a nullable `share_token TEXT` column to `recipes` with a unique constraint.

- `NULL` means the recipe is not shared.
- Enabling sharing generates a cryptographically random, URL-safe token with at least 192 bits of entropy.
- Enabling an already-shared recipe is idempotent and returns its existing token.
- Disabling sharing sets the token to `NULL`.
- Re-enabling after disabling always generates a new token, leaving the old URL permanently invalid.
- Archiving a recipe also clears its token so restoring the recipe cannot reactivate an old URL.
- The database unique constraint is the final collision guard. Token generation retries a bounded number of times on a unique-constraint conflict.

The token is intentionally stored on `recipes`. All authenticated household members are allowed to manage and copy it, consistent with the existing shared-household ownership model. Existing recipe RLS remains unchanged.

## Share Management API

Add an authenticated endpoint at `/api/recipes/[id]/share`:

- `POST` enables sharing or returns the existing active link.
- `DELETE` disables sharing by clearing the token.

Both operations use the normal authenticated Supabase client. Existing recipe RLS ensures the caller belongs to the recipe's household; no service-role client is used for share management.

Responses:

- `200` with the active token and absolute share URL after a successful `POST`.
- `204` after a successful `DELETE`.
- `401` when unauthenticated.
- `404` when the recipe does not exist or is outside the caller's household.
- `500` with a generic error when token generation or persistence fails.

## Authenticated UI

Add a `Share` action to the authenticated recipe detail page. It opens a compact modal with two states:

- Not shared: a `Create share link` action.
- Shared: a read-only URL with `Copy link` and `Disable sharing` actions.

If clipboard access fails, the URL remains selectable and the modal shows a small inline error. Disabling requires no extra confirmation because it is reversible by creating a new link, though the previous URL will not return.

## Public Route and Data Flow

Serve shared recipes at `/s/[token]`.

1. Middleware treats `/s/*` as public and does not redirect anonymous requests to login.
2. The route lives outside the authenticated app layout.
3. The server performs an exact `share_token` lookup with the existing Supabase admin client, because anonymous table access remains blocked by RLS.
4. The lookup also requires `is_archived = false`.
5. Unknown, revoked, and archived tokens all return the same generic `404`.
6. Infrastructure failures return a generic `500` without exposing database details.

The route is dynamic and uncached so recipe edits appear immediately and revocation takes effect on the next request. Token entropy makes enumeration impractical, so no public-route rate limiter is included initially; one could also interfere with legitimate chatbot fetchers.

## Shared Recipe Page

The shared page is a standalone, server-rendered, read-only recipe view. It includes every recipe field:

- Image
- Title
- Tags
- Description
- Preparation, cooking, and total times
- Servings
- Ingredients
- Steps
- Notes
- Original source URL

It contains no action buttons, forms, authenticated navigation, or account controls. In particular, it has no edit, planner, share, copy, back-to-recipes, or deletion actions. The original source URL remains a normal external content link and is the only non-recipe navigation on the page.

The HTML uses semantic headings and lists and includes Schema.org `Recipe` JSON-LD for machine readability. Reading the recipe content must not depend on client-side JavaScript. Recipe images already use the public-read `recipe-images` Supabase bucket, so no storage-policy change is needed.

## Indexing and Crawler Policy

Every `/s/*` response includes:

- Page metadata equivalent to `robots: noindex, nofollow`.
- An `X-Robots-Tag: noindex, nofollow` response header.
- No sitemap entry or public in-app link that advertises the URL.

Search crawlers must be allowed to fetch the HTML so they can observe `noindex`; a blanket `Disallow: /s/` for every robot would be counterproductive because a blocked URL can still appear in search results without its content.

`robots.txt` instead applies `/s/` restrictions to known autonomous AI search and training agents. The initial policy includes:

- `GPTBot`
- `OAI-SearchBot`
- `ClaudeBot`
- `Claude-SearchBot`

Known user-directed fetchers such as `ChatGPT-User` and `Claude-User` remain allowed so a chatbot can read a pasted share URL. The agent list is operational configuration that may need updating as providers introduce or rename crawlers.

References:

- [Google robots meta and X-Robots-Tag guidance](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [OpenAI crawler roles](https://developers.openai.com/api/docs/bots)
- [Anthropic crawler roles](https://privacy.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)

## Testing

### Database and API

- Enabling sharing creates a strong URL-safe token.
- Enabling an already-shared recipe returns the existing token.
- Disabling clears the token.
- Re-enabling creates a token different from the revoked token.
- Unauthenticated requests return `401`.
- A household member can manage any recipe in their household.
- A recipe outside the caller's household is returned as `404` through RLS.
- A token collision is retried and an unrecoverable persistence failure returns a generic `500`.
- Archiving a recipe clears its token.

### Routing and Rendering

- `/s/*` bypasses login middleware while authenticated recipe routes remain protected.
- An exact active token renders the recipe.
- Unknown, revoked, and archived tokens return `404`.
- All recipe fields render, including notes and source URL.
- The page contains valid Recipe JSON-LD.
- The page has no buttons, forms, authenticated navigation, or application action links; the original source remains available as an external link.
- Content is present in the server-rendered HTML.

### Discovery Controls

- Shared pages emit `noindex, nofollow` metadata and the `X-Robots-Tag` header.
- `robots.txt` blocks the configured autonomous AI crawlers on `/s/`.
- `robots.txt` does not block `ChatGPT-User` or `Claude-User`.
- No shared URLs are emitted in a sitemap.

### Deployment Smoke Test

After deployment to Vercel:

1. Create a share link and fetch it anonymously.
2. Verify all recipe content is present without JavaScript.
3. Inspect the metadata and `X-Robots-Tag` header.
4. Confirm ordinary anonymous fetches and user-directed chatbot fetches can read the HTML.
5. Fetch `robots.txt` and verify that its user-agent groups allow `ChatGPT-User` and `Claude-User` while disallowing the configured autonomous crawlers on `/s/`. The server itself does not reject requests based only on user-agent strings.
6. Disable the link and confirm it immediately returns `404`.
7. Re-enable sharing and confirm the new URL works while the old URL remains invalid.

## Out of Scope

- Password-protected shares
- Per-recipient access or analytics
- Share expiration dates
- A public recipe directory or sitemap
- Anonymous actions such as editing, planning, scaling, copying, or importing
- Guaranteed blocking of non-compliant scrapers
