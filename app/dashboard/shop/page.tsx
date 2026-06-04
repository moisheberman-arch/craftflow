'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getProjects, getMaterialsByProjectId, getStepsByProjectId } from '@/lib/api/supabase-client'
import type { Project, MaterialItem, ProductionStep } from '@/lib/core/types'

interface ProjectWithCounts extends Project {
  stepsTotal: number
  stepsCompleted: number
  materialsTotal: number
  materialsReceived: number
}

const STATUS_LABELS: Record<string, string> = {
  deposit_received: 'Deposit Received',
  in_production: 'In Production',
}

export default function ShopDashboard() {
  const [projects, setProjects] = useState<ProjectWithCounts[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const all = await getProjects()
      const active = all.filter(p => p.status === 'in_production' || p.status === 'deposit_received')
      const withCounts = await Promise.all(
        active.map(async p => {
          const [steps, materials] = await Promise.all([
            getStepsByProjectId(p.id).catch(() => [] as ProductionStep[]),
            getMaterialsByProjectId(p.id).catch(() => [] as MaterialItem[]),
          ])
          return {
            ...p,
            stepsTotal: steps.length,
            stepsCompleted: steps.filter(s => s.completed).length,
            materialsTotal: materials.length,
            materialsReceived: materials.filter(m => m.received).length,
          }
        })
      )
      setProjects(withCounts)
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Shop Dashboard</h1>

      {loading ? (
        <div className="text-center text-gray-500 py-8">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="text-center text-gray-500 py-8">No active production projects</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            // Bug 5: add ?view=shop so project detail shows correct tabs
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}?view=shop`}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-amber-500/50 transition-colors block"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-white">
                    {p.customer?.name ?? <span className="text-gray-500 italic">No customer</span>}
                  </p>
                  <p className="text-sm text-gray-400 capitalize mt-0.5">
                    {p.project_type?.replace(/_/g, ' ') ?? '—'}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  p.status === 'in_production' ? 'bg-orange-900 text-orange-200' : 'bg-green-900 text-green-200'
                }`}>
                  {STATUS_LABELS[p.status ?? ''] ?? p.status}
                </span>
              </div>

              <div className="space-y-2 mt-4">
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Production Steps</span>
                    <span>{p.stepsCompleted}/{p.stepsTotal}</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: p.stepsTotal > 0 ? `${(p.stepsCompleted / p.stepsTotal) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Materials Received</span>
                    <span>{p.materialsReceived}/{p.materialsTotal}</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: p.materialsTotal > 0 ? `${(p.materialsReceived / p.materialsTotal) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
