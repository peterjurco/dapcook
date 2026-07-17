'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Link2Off, Share2, X } from 'lucide-react'

interface ShareRecipeButtonProps {
  recipeId: string
  initialShareToken: string | null
}

const ACTION_ERROR = 'Something went wrong. Try again.'
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function ShareRecipeButton({ recipeId, initialShareToken }: ShareRecipeButtonProps) {
  const [open, setOpen] = useState(false)
  const [shareToken, setShareToken] = useState(initialShareToken)
  const [shareUrl, setShareUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    setShareUrl((currentUrl) =>
      shareToken ? currentUrl || `${window.location.origin}/s/${shareToken}` : '',
    )
  }, [shareToken])

  const close = useCallback(() => {
    if (loading) return
    setOpen(false)
    setCopied(false)
    setError(null)
  }, [loading])

  useEffect(() => {
    if (!open) return

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [close, open])

  useEffect(() => {
    if (open) {
      dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (wasOpenRef.current) {
      triggerRef.current?.focus()
    }

    wasOpenRef.current = open
  }, [open, shareToken])

  function containFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    if (!dialog) return

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    } else if (!dialog.contains(active)) {
      event.preventDefault()
      const target = event.shiftKey ? last : first
      target.focus()
    }
  }

  async function handleEnable() {
    setLoading(true)
    setCopied(false)
    setError(null)

    try {
      const response = await fetch(`/api/recipes/${recipeId}/share`, { method: 'POST' })
      if (!response.ok) throw new Error('Could not enable sharing')

      const data = (await response.json()) as { share_token: string; share_url: string }
      setShareToken(data.share_token)
      setShareUrl(data.share_url)
    } catch {
      setError(ACTION_ERROR)
    } finally {
      setLoading(false)
    }
  }

  async function handleDisable() {
    setLoading(true)
    setCopied(false)
    setError(null)

    try {
      const response = await fetch(`/api/recipes/${recipeId}/share`, { method: 'DELETE' })
      if (response.status !== 204) throw new Error('Could not disable sharing')

      setShareToken(null)
      setShareUrl('')
    } catch {
      setError(ACTION_ERROR)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    setCopied(false)
    setError(null)

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
    } catch {
      setError('Could not copy the link. Select and copy it manually.')
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
      >
        <Share2 size={13} />
        Share
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            data-testid="share-modal-backdrop"
            className="absolute inset-0 bg-gray-950/35"
            onMouseDown={close}
          />
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-recipe-title"
            className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl sm:p-6"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={containFocus}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="share-recipe-title" className="text-lg font-semibold tracking-tight text-gray-900">
                Share recipe
              </h2>
              <button
                type="button"
                aria-label="Close"
                disabled={loading}
                onClick={close}
                className="-mr-1 -mt-1 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            {shareToken ? (
              <div className="mt-4 space-y-4">
                <p className="text-sm leading-5 text-gray-500">Anyone with this link can view the recipe.</p>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                  <input
                    data-autofocus
                    readOnly
                    aria-label="Share link"
                    value={shareUrl}
                    onClick={(event) => event.currentTarget.select()}
                    onFocus={(event) => event.currentTarget.select()}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 font-mono text-sm text-gray-700 outline-none selection:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-400"
                  />
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleDisable}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Link2Off size={14} />
                    Disable sharing
                  </button>
                  <button
                    type="button"
                    disabled={loading || !shareUrl}
                    onClick={handleCopy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <button
                  data-autofocus
                  type="button"
                  disabled={loading}
                  onClick={handleEnable}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Share2 size={14} />
                  {loading ? 'Creating link…' : 'Create share link'}
                </button>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  )
}
