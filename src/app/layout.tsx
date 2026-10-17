import type { Metadata } from 'next'
import { Fraunces } from 'next/font/google'
import './globals.css'
import { PostHogProvider } from '@/components/providers/PostHogProvider'
import { SplashScreen } from '@/components/ui/SplashScreen'
import { siteUrl } from '@/lib/og/site-url'
import NextTopLoader from 'nextjs-toploader'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-fraunces',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: 'dapcook',
  description: 'Your shared cookbook & meal planner',
  openGraph: { siteName: 'dapcook', title: 'dapcook', type: 'website' },
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body className="font-sans antialiased">
        <SplashScreen />
        <NextTopLoader color="#047857" showSpinner={false} />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
