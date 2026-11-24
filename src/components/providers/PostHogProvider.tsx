'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { isPostHogPath } from '@/lib/analytics/is-posthog-path'
import { PostHogPageView } from './PostHogPageView'

function PostHogRuntime({
  children,
  claimFirstInit,
}: {
  children: React.ReactNode
  /** True the first time it is called for this provider, false after. */
  claimFirstInit: () => boolean
}) {
  useLayoutEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return

    if (claimFirstInit()) {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
        capture_pageview: false,
        capture_pageleave: true,
        // Signals for the weekly PostHog review: browser errors, clicks that do
        // nothing, and console output inside recordings.
        capture_exceptions: true,
        capture_dead_clicks: true,
        enable_recording_console_log: true,
        session_recording: {
          maskAllInputs: false,
        },
      })
    } else {
      posthog.set_config({
        autocapture: true,
        capture_pageleave: true,
        capture_exceptions: true,
        capture_dead_clicks: true,
        disable_session_recording: false,
      })
      posthog.startSessionRecording()
    }

    return () => {
      posthog.set_config({
        autocapture: false,
        capture_pageleave: false,
        capture_exceptions: false,
        capture_dead_clicks: false,
        disable_session_recording: true,
      })
      posthog.stopSessionRecording()
    }
  }, [claimFirstInit])

  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PHProvider>
  )
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Lives here, not in PostHogRuntime, so it survives the runtime unmounting on a shared path.
  const initialized = useRef(false)
  const claimFirstInit = useCallback(() => {
    if (initialized.current) return false
    initialized.current = true
    return true
  }, [])

  if (!isPostHogPath(pathname)) return children

  return <PostHogRuntime claimFirstInit={claimFirstInit}>{children}</PostHogRuntime>
}
