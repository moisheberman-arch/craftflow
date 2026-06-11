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
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <nav className="bg-white shadow-sm border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link href="/dashboard/sales" className="text-lg font-bold text-blue-600 tracking-tight">
          CraftFlow
        </Link>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <Link
            href="/dashboard/sales"
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isSales ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Sales View
          </Link>
          <Link
            href="/dashboard/shop"
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isShop ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Shop View
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/suppliers"
            className={`text-sm transition-colors ${pathname.startsWith('/dashboard/suppliers') ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Suppliers
          </Link>
          <Link
            href="/dashboard/portfolio"
            className={`text-sm transition-colors ${pathname.startsWith('/dashboard/portfolio') ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Portfolio
          </Link>
          <Link
            href="/dashboard/master"
            className={`text-sm transition-colors ${isMaster ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Master Doc
          </Link>
          <Link
            href="/dashboard/touchups"
            className={`text-sm transition-colors flex items-center gap-1.5 ${
              isTouchups ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
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
            <button className={`text-sm transition-colors ${isSettings ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}>
              Settings ▾
            </button>
            <div className="absolute right-0 top-full pt-1 hidden group-hover:block z-50">
              <div className="bg-white shadow-sm border border-gray-200 rounded-lg shadow-xl overflow-hidden min-w-[160px]">
                <Link href="/dashboard/settings/pricing" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-gray-900">Pricing Config</Link>
                <Link href="/dashboard/settings/project-types" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-gray-900">Project Types</Link>
                <Link href="/dashboard/settings/steps" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-gray-900">Step Templates</Link>
                <Link href="/dashboard/settings/manage-projects" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-gray-900">Manage Projects</Link>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
