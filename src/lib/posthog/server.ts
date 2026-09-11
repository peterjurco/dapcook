import { PostHog } from 'posthog-node'

let client: PostHog | null | undefined

function getClient(): PostHog | null {
  if (client !== undefined) return client

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  client = key
    ? new PostHog(key, {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
        // Serverless functions can exit right after the response is sent, so flush
        // every event immediately instead of batching.
        flushAt: 1,
        flushInterval: 0,
      })
    : null

  return client
}

export async function captureServerException(
  error: unknown,
  properties?: Record<string, unknown>
): Promise<void> {
  const posthog = getClient()
  if (!posthog) return

  await posthog.captureException(error, undefined, properties)
}
