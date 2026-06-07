'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getOpenTouchups } from '@/lib/api/supabase-client'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [urgentCount, setUrgentCount] = useState(0)

  const isSales = pathname.startsWith('/dashboard/sales') || pathname.startsWith('/dashboard/customers')
  const isShop = pathname.startsWith('/dashboard/shop')
  const isSettings = pathname.startsWith('/dashboard/settings')
  const isTouchups = pathname.startsWith('/dashboard/touchups')
  const isMaster = pathname.startsWith('/dashboard/master')

  useEffect(() => {
    getOpenTouchups()
      .then(items => setUrgentCount(items.filter(t => t.priority === 'urgent').length))
      .catch(() => {})
  }, [pathname])

  async function handleLogout() {
    await fetch('/api/logout')
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <Link href="/dashboard/sales" className="text-lg font-bold text-amber-400 tracking-tight">
          CraftFlow
        </Link>

        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          <Link
            href="/dashboard/sales"
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isSales ? 'bg-amber-500 text-gray-950' : 'text-gray-400 hover:text-white'
            }`}
          >
            Sales View
          </Link>
          <Link
            href="/dashboard/shop"
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isShop ? 'bg-amber-500 text-gray-950' : 'text-gray-400 hover:text-white'
            }`}
          >
            Shop View
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/master"
            className={`text-sm transition-colors ${isMaster ? 'text-amber-400' : 'text-gray-400 hover:text-white'}`}
          >
            Master Doc
          </Link>
          <Link
            href="/dashboard/touchups"
            className={`text-sm transition-colors flex items-center gap-1.5 ${
              isTouchups ? 'text-amber-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Touch-Ups
            {urgentCount > 0 && (
              <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {urgentCount}
              </span>
            )}
          </Link>
          <div className="relative group">
            <button className={`text-sm transition-colors ${isSettings ? 'text-amber-400' : 'text-gray-400 hover:text-white'}`}>
              Settings ▾
            </button>
            <div className="absolute right-0 top-full pt-1 hidden group-hover:block z-50">
              <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-xl overflow-hidden min-w-[160px]">
                <Link href="/dashboard/settings/pricing" className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white">Pricing Config</Link>
                <Link href="/dashboard/settings/project-types" className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white">Project Types</Link>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
