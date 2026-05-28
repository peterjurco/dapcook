'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Calendar, ShoppingCart, Settings, LogOut, Shield } from 'lucide-react'
import { usePostHog } from 'posthog-js/react'
import { cn } from '@/lib/utils/cn'
import { signOut } from '@/lib/auth/actions'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { href: '/recipes', label: 'Recipes', icon: <BookOpen size={18} /> },
  { href: '/planner', label: 'Planner', icon: <Calendar size={18} /> },
  { href: '/shopping', label: 'Shopping', icon: <ShoppingCart size={18} /> },
  { href: '/settings', label: 'Settings', icon: <Settings size={18} /> },
]

interface AppShellProps {
  user: User
  profile: Profile
  isAdmin?: boolean
  children: React.ReactNode
}

export function AppShell({ user, profile, isAdmin = false, children }: AppShellProps) {
  const pathname = usePathname()
  const posthog = usePostHog()

  return (
    <div className="flex flex-col md:flex-row min-h-dvh md:h-screen bg-gray-50">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-56 flex-shrink-0 bg-white border-r border-gray-200 flex-col">
        <div className="px-4 py-5 border-b border-gray-200">
          <span className="text-lg font-bold text-gray-900">dapcook</span>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                pathname.startsWith(item.href)
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Shield size={18} />
              Admin
            </Link>
          )}
        </nav>

        <div className="px-4 py-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.display_name ?? 'User'}
                className="w-7 h-7 rounded-full"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                {(profile.display_name ?? user.email ?? 'U')[0].toUpperCase()}
              </div>
            )}
            <span className="text-sm text-gray-700 truncate">
              {profile.display_name ?? user.email}
            </span>
          </div>
          <button
            type="button"
            onClick={async () => {
              posthog.reset()
              await signOut()
            }}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 md:overflow-auto pb-16 md:pb-0">{children}</main>

      {/* Bottom tab bar — mobile only */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-50">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
              pathname.startsWith(item.href)
                ? 'text-gray-900'
                : 'text-gray-400'
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
              pathname.startsWith('/admin') ? 'text-gray-900' : 'text-gray-400'
            )}
          >
            <Shield size={18} />
            Admin
          </Link>
        )}
      </nav>
    </div>
  )
}
