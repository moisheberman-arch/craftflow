import { NextResponse } from 'next/server'

export async function GET() {
  const res = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))
  res.cookies.set('cf_session', '', { maxAge: 0, path: '/' })
  return res
}
