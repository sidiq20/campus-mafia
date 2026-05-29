import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Check if the JWT cookie exists
  const token = request.cookies.get('jwt')
  const { pathname } = request.nextUrl
  
  // Define routes that require authentication
  const protectedRoutes = ['/feed', '/territory', '/comms', '/black-market']
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  if (isProtectedRoute && !token) {
    // Redirect unauthenticated users to login
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Define routes meant only for unauthenticated users
  const authRoutes = ['/login', '/signup']
  const isAuthRoute = authRoutes.some(route => pathname.startsWith(route))
  
  if (isAuthRoute && token) {
    // Redirect already authenticated users to their dashboard (feed)
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Apply middleware only to these specific paths to optimize performance
  matcher: [
    '/feed/:path*',
    '/territory/:path*',
    '/comms/:path*',
    '/black-market/:path*',
    '/login',
    '/signup'
  ]
}
