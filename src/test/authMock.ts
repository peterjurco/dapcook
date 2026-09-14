import { vi } from 'vitest'

interface FakeUser {
  id: string
  email?: string | null
}

/**
 * Builds the `auth` slice of a mocked Supabase client.
 *
 * Server code reads the signed-in user through `getCurrentUser()`, which calls
 * `auth.getClaims()` — the token is verified locally rather than at the auth
 * server. Tests still describe their fixture as a user, so this translates one
 * into the claim shape (`sub`, `email`) the real token carries. `getUser` is
 * kept alongside it for the few call sites that genuinely need the full user
 * record, such as the OAuth callback.
 */
export function authMock(user: FakeUser | null) {
  return {
    getClaims: vi.fn().mockResolvedValue(
      user
        ? { data: { claims: { sub: user.id, email: user.email ?? null } }, error: null }
        : { data: null, error: null }
    ),
    getUser: vi.fn().mockResolvedValue({ data: { user } }),
  }
}
