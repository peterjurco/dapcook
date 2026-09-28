import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/join',
  '/onboarding',
  '/robots.txt',
  '/s',
  '/dev',
]

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
}

export function canBypassAuth(pathname: string): boolean {
  return (
    pathname === '/robots.txt' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/s' ||
    pathname.startsWith('/s/')
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (canBypassAuth(pathname)) return NextResponse.next({ request })

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: never use getSession() — it trusts the cookie without checking
  // the signature. getClaims() verifies it, and because this project signs
  // tokens with an asymmetric key it does so locally against a process-cached
  // JWKS, instead of the auth-server round trip getUser() costs on every
  // request (and this runs on every request).
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims?.sub ? { id: data.claims.sub } : null

  // Redirect root to /recipes (or /login if unauthed — handled below)
  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = user ? '/recipes' : '/login'
    return NextResponse.redirect(url)
  }

  // Protect app routes
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Authenticated user hitting login → send to app
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/recipes'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
