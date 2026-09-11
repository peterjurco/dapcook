import type { Metadata } from 'next'
import { Fraunces } from 'next/font/google'
import './globals.css'
import { PostHogProvider } from '@/components/providers/PostHogProvider'
import NextTopLoader from 'nextjs-toploader'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600'],
  variable: '--font-fraunces',
})

export const metadata: Metadata = {
  title: 'dapcook',
  description: 'Your shared cookbook & meal planner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body className="font-sans antialiased">
        <NextTopLoader color="#047857" showSpinner={false} />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
