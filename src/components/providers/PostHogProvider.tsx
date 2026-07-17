'use client'

import { useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { usePathname } from 'next/navigation'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { isPostHogPath } from '@/lib/analytics/is-posthog-path'
import { PostHogPageView } from './PostHogPageView'

function PostHogRuntime({
  children,
  initialized,
}: {
  children: React.ReactNode
  initialized: MutableRefObject<boolean>
}) {
  useLayoutEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return

    if (!initialized.current) {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
        capture_pageview: false,
        capture_pageleave: true,
        session_recording: {
          maskAllInputs: false,
        },
      })
      initialized.current = true
    } else {
      posthog.set_config({
        autocapture: true,
        capture_pageleave: true,
        disable_session_recording: false,
      })
      posthog.startSessionRecording()
    }

    return () => {
      posthog.set_config({
        autocapture: false,
        capture_pageleave: false,
        disable_session_recording: true,
      })
      posthog.stopSessionRecording()
    }
  }, [initialized])

  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PHProvider>
  )
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const initialized = useRef(false)

  if (!isPostHogPath(pathname)) return children

  return <PostHogRuntime initialized={initialized}>{children}</PostHogRuntime>
}
