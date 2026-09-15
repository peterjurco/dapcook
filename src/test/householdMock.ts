import { vi } from 'vitest'

/**
 * Stands in for `getCurrentHouseholdId()`.
 *
 * Route handlers no longer read the household off the request-scoped Supabase
 * client — it comes from a cross-request cache backed by the service-role
 * client — so mocking the client's `profiles` table no longer reaches it.
 * Tests drive this instead: `householdIdMock.mockResolvedValue(null)` for the
 * "user has no household" paths.
 */
export const householdIdMock = vi.fn()
