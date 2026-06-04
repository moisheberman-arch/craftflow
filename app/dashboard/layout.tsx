'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const isSales = pathname.startsWith('/dashboard/sales') || pathname.startsWith('/dashboard/customers')
  const isShop = pathname.startsWith('/dashboard/shop')
  const isSettings = pathname.startsWith('/dashboard/settings')

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
            href="/dashboard/settings/pricing"
            className={`text-sm transition-colors ${
              isSettings ? 'text-amber-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Settings
          </Link>
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
