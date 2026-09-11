export function register() {
  // No-op: required export for Next.js to load this module.
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { captureServerException } = await import('@/lib/posthog/server')
  await captureServerException(error, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  })
}
