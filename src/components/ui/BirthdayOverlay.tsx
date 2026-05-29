'use client'

import { useEffect, useState } from 'react'
import confetti from 'canvas-confetti'
import { getBirthdayWindowISO } from '@/lib/utils/birthday'

const STORAGE_KEY = 'birthday_shown'

interface Props {
  birthdayDate: string
  birthdayMessage: string
}

export function BirthdayOverlay({ birthdayDate, birthdayMessage }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const iso = getBirthdayWindowISO(birthdayDate)
    if (!iso) return
    if (localStorage.getItem(STORAGE_KEY) === iso) return

    setVisible(true)
    confetti({
      particleCount: 160,
      spread: 90,
      origin: { y: 0.1 },
      zIndex: 60,
    })
  }, [birthdayDate])

  function dismiss() {
    const iso = getBirthdayWindowISO(birthdayDate)
    if (iso) localStorage.setItem(STORAGE_KEY, iso)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="text-6xl mb-4">🎂</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Happy Birthday!</h1>
        <p className="text-base text-gray-600 mb-6 whitespace-pre-line">{birthdayMessage}</p>
        <button
          type="button"
          onClick={dismiss}
          className="w-full sm:w-auto px-8 py-2.5 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors"
        >
          Thank you! 🎉
        </button>
      </div>
    </div>
  )
}
