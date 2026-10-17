import { ImageResponse } from 'next/og'
import { AppCard, OG_SIZE } from '@/lib/og/cards'
import { loadOgFonts } from '@/lib/og/fonts'

export const alt = 'dapcook'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(<AppCard />, { ...OG_SIZE, fonts: await loadOgFonts() })
}
