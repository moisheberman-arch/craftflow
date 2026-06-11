'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllUnpurchasedShoppingItems, updateShoppingListItem } from '@/lib/api/supabase-client'
import type { ShoppingListItem } from '@/lib/core/types'

interface GroupedItems {
  projectId: string
  label: string
  items: ShoppingListItem[]
}

export default function ShoppingListPage() {
  const [groups, setGroups] = useState<GroupedItems[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  async function load() {
    const items = await getAllUnpurchasedShoppingItems().catch(() => [] as ShoppingListItem[])
    setTotalCount(items.length)
    // Group by project
    const map = new Map<string, GroupedItems>()
    for (const item of items) {
      const pid = item.project_id ?? 'general'
      if (!map.has(pid)) {
        const p = item.project
        const customerName = (p as any)?.customer?.name ?? 'Unknown Customer'
        const projectType = p?.project_type?.replace(/_/g, ' ') ?? 'Project'
        map.set(pid, {
          projectId: pid,
          label: item.project_id ? `${customerName} — ${projectType}` : 'General',
          items: [],
        })
      }
      map.get(pid)!.items.push(item)
    }
    setGroups(Array.from(map.values()))
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function handlePurchased(item: ShoppingListItem) {
    await updateShoppingListItem(item.id, { purchased: true })
    // Remove from view immediately
    setGroups(prev =>
      prev
        .map(g => ({ ...g, items: g.items.filter(i => i.id !== item.id) }))
        .filter(g => g.items.length > 0)
    )
    setTotalCount(c => c - 1)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/shop" className="text-gray-500 hover:text-gray-700 text-sm">← Shop</Link>
          <h1 className="text-2xl font-bold">Shopping List</h1>
          {totalCount > 0 && (
            <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {totalCount}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">All clear! 🎉</p>
          <p className="text-sm">No unpurchased items across any projects.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.projectId}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="font-semibold text-gray-900">{group.label}</h2>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {group.items.length}
                </span>
                <Link
                  href={`/dashboard/projects/${group.projectId}?view=shop`}
                  className="text-xs text-blue-600 hover:text-blue-500 ml-auto"
                >
                  View Project →
                </Link>
              </div>
              <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
                {group.items.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 last:border-0 hover:bg-blue-50/40"
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => handlePurchased(item)}
                      className="accent-emerald-500 w-4 h-4 shrink-0 cursor-pointer"
                    />
                    <span className="flex-1 text-sm text-gray-900">{item.item}</span>
                    {item.notes && (
                      <span className="text-xs text-gray-500">{item.notes}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
