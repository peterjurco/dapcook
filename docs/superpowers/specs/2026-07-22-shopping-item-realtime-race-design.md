# Shopping Item Realtime Race Fix

## Problem

Saving a new shopping item and receiving its Supabase Realtime `INSERT` are two representations of the same operation. Today the optimistic row has a temporary `pending-*` ID while the database assigns a different UUID. Realtime therefore appends the persisted item as a second row. The duplicate remains visible until the save flow finishes its follow-up `sort_order` request and reconciles both rows.

## Design

Generate the shopping item UUID in the client when the pending row is created. Track whether the row is pending separately from its ID. Send that UUID with the create request and have the API use it for the inserted record.

The optimistic row, POST response, and Realtime payload will then have the same ID. The existing Realtime duplicate guard can recognize the optimistic row and avoid appending another item. After persistence completes, the pending state is cleared and the row retains its stable React and drag-and-drop identity.

No database migration is required because `shopping_items.id` is already a UUID. The API will only accept a client-supplied UUID after authenticating the user and verifying ownership of the target shopping list.

## Error Handling

If creation fails, the row remains available through the existing error and retry UI. Retrying uses the same UUID. A UUID collision returns the existing API failure state rather than creating or overwriting another item.

## Testing

Add a component regression test that creates a pending item, starts its save, emits the matching Realtime `INSERT` before the POST resolves, and verifies only one named row is rendered. Verify the pending row becomes persisted after the request completes. Add API coverage that confirms a valid supplied UUID is inserted and returned.

## Alternatives Rejected

- Buffer all realtime inserts while local creates are in flight: correct but adds coordination and delayed remote updates.
- Match realtime rows to pending rows by name/category: ambiguous when equal items are added concurrently.
- Reconcile immediately after POST but keep server-generated IDs: reduces the duplicate window but cannot prevent realtime from arriving before the response.
