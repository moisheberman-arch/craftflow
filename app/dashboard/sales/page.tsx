'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getProjects, createProject } from '@/lib/api/supabase-client'
import type { Project, ProjectStatus } from '@/lib/core/types'

const STATUS_LABELS: Record<ProjectStatus, string> = {
  lead: 'Lead',
  design_meeting_scheduled: 'Design Meeting',
  rendering: 'Rendering',
  quote_issued: 'Quote Issued',
  deposit_received: 'Deposit Received',
  in_production: 'In Production',
  completed: 'Completed',
}

const STATUS_COLORS: Record<ProjectStatus, string> = {
  lead: 'bg-gray-700 text-gray-200',
  design_meeting_scheduled: 'bg-blue-900 text-blue-200',
  rendering: 'bg-purple-900 text-purple-200',
  quote_issued: 'bg-yellow-900 text-yellow-200',
  deposit_received: 'bg-green-900 text-green-200',
  in_production: 'bg-orange-900 text-orange-200',
  completed: 'bg-emerald-900 text-emerald-200',
}

type FilterTab = 'all' | 'lead' | 'design_meeting_scheduled' | 'quote_issued' | 'deposit_received'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'lead', label: 'Leads' },
  { key: 'design_meeting_scheduled', label: 'Design Meeting' },
  { key: 'quote_issued', label: 'Quote Issued' },
  { key: 'deposit_received', label: 'Deposit Received' },
]

export default function SalesDashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [filter, setFilter] = useState<FilterTab>('all')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter)

  async function handleNewProject() {
    const p = await createProject({
      customer_id: null,
      project_type: null,
      status: 'lead',
      address: null,
      notes: null,
      required_fields_completed: {
        customer_info: false,
        project_type: false,
        color_finish: false,
        quote_issued: false,
      },
    })
    router.push(`/dashboard/projects/${p.id}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sales Dashboard</h1>
        <button
          onClick={handleNewProject}
          className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          + New Project
        </button>
      </div>

      <div className="flex gap-1 mb-4">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === tab.key
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No projects found</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-sm font-medium text-gray-400">Customer</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-400">Project Type</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-400">Last Updated</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(project => (
                <tr key={project.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-sm">
                    {project.customer?.name ?? <span className="text-gray-500 italic">No customer</span>}
                  </td>
                  <td className="px-4 py-3 text-sm capitalize">
                    {project.project_type?.replace('_', ' ') ?? <span className="text-gray-500 italic">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {project.status ? (
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[project.status]}`}>
                        {STATUS_LABELS[project.status]}
                      </span>
                    ) : (
                      <span className="text-gray-500 italic text-sm">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {new Date(project.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/projects/${project.id}`}
                      className="text-sm text-amber-400 hover:text-amber-300"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
