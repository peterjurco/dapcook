import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function FlowLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}
