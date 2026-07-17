'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'
import { usePostHog } from 'posthog-js/react'
import { isPostHogPath } from '@/lib/analytics/is-posthog-path'

function PostHogPageViewInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = usePostHog()

  useEffect(() => {
    if (!posthog || !isPostHogPath(pathname)) return
    let url = window.location.origin + pathname
    const params = searchParams.toString()
    if (params) url += `?${params}`
    posthog.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams, posthog])

  return null
}

export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageViewInner />
    </Suspense>
  )
}
