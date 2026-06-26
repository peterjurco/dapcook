import type { Metadata } from 'next'
import './globals.css'
import { PostHogProvider } from '@/components/providers/PostHogProvider'
import NextTopLoader from 'nextjs-toploader'

export const metadata: Metadata = {
  title: 'dapcook',
  description: 'Your shared cookbook & meal planner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <NextTopLoader color="#111827" showSpinner={false} />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
