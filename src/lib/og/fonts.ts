import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Static Fraunces 600 from @fontsource (OFL, see fonts/OFL.txt). next/og reads
// WOFF but not WOFF2, and the variable font next/font serves isn't supported.
// latin-ext carries č, á, ň and friends for Slovak household and recipe names.
const FONT_DIR = join(process.cwd(), 'src/lib/og/fonts')

export async function loadOgFonts() {
  const [latin, latinExt] = await Promise.all([
    readFile(join(FONT_DIR, 'fraunces-latin-600-normal.woff')),
    readFile(join(FONT_DIR, 'fraunces-latin-ext-600-normal.woff')),
  ])
  return [
    { name: 'Fraunces', data: latin, weight: 600 as const, style: 'normal' as const },
    { name: 'Fraunces', data: latinExt, weight: 600 as const, style: 'normal' as const },
  ]
}
