'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, Share2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Props {
  url: string
  /** Message that goes with the link when shared through the system share sheet. */
  shareText: string
}

export function InviteLink({ url, shareText }: Props) {
  const t = useTranslations('settings')
  const [copied, setCopied] = useState(false)
  // Decided after mount: the server cannot know whether the browser can share.
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    setCanShare(typeof navigator.share === 'function')
  }, [])

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleShare() {
    try {
      await navigator.share({ title: 'dapcook', text: shareText, url })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      try {
        await handleCopy()
      } catch {
        // Clipboard blocked too; the link is still visible in the field to copy by hand.
      }
    }
  }

  const buttonClass =
    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors'

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={url}
        className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-700 font-mono"
      />
      <button type="button" onClick={handleCopy} className={buttonClass}>
        {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
        {copied ? t('inviteLink.copied') : t('inviteLink.copy')}
      </button>
      {canShare && (
        <button type="button" onClick={handleShare} className={buttonClass}>
          <Share2 size={14} />
          {t('inviteLink.share')}
        </button>
      )}
    </div>
  )
}
