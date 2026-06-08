# Clear Shopping List — Design Spec

## Overview

Add a "Clear list" button to the shopping list page that removes all items from the current list after a confirmation dialog.

## API

**New endpoint:** `DELETE /api/shopping/list/[listId]/items`

- Verifies user is authenticated and belongs to the household that owns the list (analogous to `verifyItemOwnership` in the existing items endpoint)
- Executes a single DB query: `supabase.from('shopping_items').delete().eq('list_id', listId)`
- Returns `204 No Content` on success; `401` / `403` / `404` on auth/ownership errors

## UI

**Button placement:** In the `ShoppingClient` toolbar, alongside the existing Copy button.

**Interaction flow:**
1. User clicks "Clear list" (trash icon + label)
2. A small confirmation modal appears: "Remove all items from the list?" with a red "Clear" button and a "Cancel" button
3. On confirm: optimistically set `items` to `[]`, call the API, revert on error
4. Button is hidden when the list is already empty

**Component changes:**
- `ShoppingClient.tsx` — add `handleClearList()` handler and confirmation modal state
- No changes to `ShoppingItemRow.tsx` or the server page component

## Testing

- **API route:** auth check, ownership check, successful deletion returns 204
- **ShoppingClient:** clicking Clear shows modal; confirming clears items and calls API; cancelling does nothing
