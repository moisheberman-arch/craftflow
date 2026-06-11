import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const session = req.cookies.get('cf_session')
  const { pathname } = req.nextUrl

  // Public routes: login + customer approval links (no auth required)
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/approve') ||
    pathname.startsWith('/api/approve')
  ) {
    return NextResponse.next()
  }

  if (!session || session.value !== 'authenticated') {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
