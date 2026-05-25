'use client'

import { useEffect, Suspense } from 'react'
import { usePostHog } from 'posthog-js/react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'

interface Props {
  userId: string
  email: string
}

function PostHogIdentifierInner({ userId, email }: Props) {
  const posthog = usePostHog()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    posthog.identify(userId, { email })
  }, [posthog, userId, email])

  useEffect(() => {
    if (searchParams.get('ob') !== '1') return
    posthog.capture('onboarding_completed')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('ob')
    router.replace(pathname + (params.toString() ? `?${params.toString()}` : ''))
  }, [posthog, searchParams, pathname, router])

  return null
}

export function PostHogIdentifier(props: Props) {
  return (
    <Suspense fallback={null}>
      <PostHogIdentifierInner {...props} />
    </Suspense>
  )
}
