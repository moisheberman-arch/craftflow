'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  getProjects,
  getOpenTouchups,
  getUnresolvedQuestionsAllProjects,
  getMaterialsByProjectId,
  getStepsByProjectId,
  getShopTaskProjects,
} from '@/lib/api/supabase-client'
import type { Project, Touchup, OpenQuestion, MaterialItem, ProductionStep, Customer } from '@/lib/core/types'

interface EnrichedProject extends Project {
  currentStep: ProductionStep | null
  daysSinceUpdate: number
  deliveryDaysLeft: number | null
  isOverdue: boolean
  isUrgent: boolean
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function daysUntil(dateStr: string | null | undefined) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function deliveryRowColor(daysLeft: number | null, isOverdue: boolean) {
  if (isOverdue || (daysLeft !== null && daysLeft < 0)) return 'bg-red-950/30'
  if (daysLeft !== null && daysLeft <= 14) return 'bg-orange-950/20'
  return ''
}

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead', tentative_quote_sent: 'Quote Sent', design_meeting_scheduled: 'Design Mtg',
  post_design_meeting: 'Post Meeting', rendering_in_progress: 'Rendering',
  final_quote_issued: 'Final Quote', deposit_received: 'Deposit', in_production: 'In Production', ready_for_delivery: 'Ready for Delivery', completed: 'Completed',
}

export default function MasterDocPage() {
  const [projects, setProjects] = useState<EnrichedProject[]>([])
  const [touchups, setTouchups] = useState<Touchup[]>([])
  const [questions, setQuestions] = useState<OpenQuestion[]>([])
  const [pendingMaterials, setPendingMaterials] = useState<{ project: Project; items: MaterialItem[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const [allProjects, tu, qs] = await Promise.all([
      getProjects(),
      getOpenTouchups().catch(() => [] as Touchup[]),
      getUnresolvedQuestionsAllProjects().catch(() => [] as OpenQuestion[]),
    ])

    const activeProjects = allProjects.filter(p =>
      p.status && !['completed'].includes(p.status)
    )

    const enriched = await Promise.all(activeProjects.map(async p => {
      const steps = await getStepsByProjectId(p.id).catch(() => [] as ProductionStep[])
      const currentStep = steps.find(s => s.is_current) ?? null
      const daysLeft = daysUntil(p.expected_delivery_end)
      return {
        ...p,
        currentStep,
        daysSinceUpdate: daysSince(p.updated_at),
        deliveryDaysLeft: daysLeft,
        isOverdue: daysLeft !== null && daysLeft < 0,
        isUrgent: daysLeft !== null && daysLeft <= 14 && daysLeft >= 0,
      } as EnrichedProject
    }))

    // Pending materials grouped by project
    const matGroups: { project: Project; items: MaterialItem[] }[] = []
    await Promise.all(activeProjects.map(async p => {
      const mats = await getMaterialsByProjectId(p.id).catch(() => [] as MaterialItem[])
      const pending = mats.filter(m => !m.ordered || !m.received)
      if (pending.length > 0) matGroups.push({ project: p, items: pending })
    }))

    setProjects(enriched)
    setTouchups(tu)
    setQuestions(qs)
    setPendingMaterials(matGroups.sort((a, b) => a.project.updated_at.localeCompare(b.project.updated_at)))
  }, [])

  useEffect(() => { load().finally(() => setLoading(false)) }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    await load().catch(console.error)
    setRefreshing(false)
  }

  const urgentTouchups = touchups.filter(t => t.priority === 'urgent')
  const normalTouchups = touchups.filter(t => t.priority === 'normal')
  const inQueue = projects.filter(p => p.currentStep?.step_name === 'Ready for Production — In Queue')
  const overdue = projects.filter(p => p.isOverdue)
  const actionTasks = projects.filter(p => p.currentStep?.step_type === 'action' && (p.status === 'in_production' || p.status === 'deposit_received' || p.status === 'ready_for_delivery'))
  const waitingTasks = projects.filter(p => p.currentStep?.step_type === 'waiting' && (p.status === 'in_production' || p.status === 'deposit_received' || p.status === 'ready_for_delivery'))

  // Group questions by project
  const qByProject = new Map<string, OpenQuestion[]>()
  for (const q of questions) {
    if (!qByProject.has(q.project_id)) qByProject.set(q.project_id, [])
    qByProject.get(q.project_id)!.push(q)
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Loading Master Doc...</div>

  return (
    <>
      <style>{`@media print { .no-print { display: none !important; } body { color: #111; background: white; } }`}</style>

      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between no-print">
          <div>
            <h1 className="text-2xl font-bold text-white">Master Doc</h1>
            <p className="text-sm text-gray-500 mt-0.5">Full business snapshot</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleRefresh} disabled={refreshing}
              className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 px-4 py-2 rounded-lg">
              {refreshing ? 'Refreshing...' : '↻ Refresh'}
            </button>
            <button onClick={() => window.print()}
              className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2 rounded-lg">
              🖨 Print
            </button>
          </div>
        </div>

        {/* Section 6: Shop Task Summary (top for quick glance) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Action Required', value: actionTasks.length, color: 'text-emerald-400' },
            { label: 'Waiting On', value: waitingTasks.length, color: 'text-orange-400' },
            { label: 'Urgent Touch-Ups', value: urgentTouchups.length, color: 'text-red-400' },
            { label: 'Open Questions', value: questions.length, color: 'text-yellow-400' },
            { label: 'Overdue Projects', value: overdue.length, color: 'text-red-500' },
            { label: 'In Queue', value: inQueue.length, color: 'text-blue-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Section 1: Active Projects */}
        <section>
          <h2 className="text-lg font-bold text-white mb-3">Active Projects</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  {['Customer', 'Type', 'Status', 'Current Step', 'Delivery', 'Last Update'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id} className={`border-b border-gray-800 last:border-0 ${deliveryRowColor(p.deliveryDaysLeft, p.isOverdue)}`}>
                    <td className="px-3 py-2.5">
                      <Link href={`/dashboard/projects/${p.id}?view=sales`} className="font-medium text-white hover:text-amber-400">
                        {(p.customer as Customer | undefined)?.name ?? 'Unknown'}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 capitalize text-xs">{p.project_type?.replace(/_/g, ' ') ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-semibold bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded">
                        {STATUS_LABELS[p.status ?? ''] ?? p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-300 max-w-[200px] truncate">{p.currentStep?.step_name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {p.expected_delivery_end ? (
                        <span className={p.isOverdue ? 'text-red-400' : p.isUrgent ? 'text-orange-400' : 'text-emerald-400'}>
                          {new Date(p.expected_delivery_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {p.isOverdue && ' ⚠'}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{p.daysSinceUpdate}d ago</td>
                  </tr>
                ))}
                {projects.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-600 text-xs">No active projects</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 2: Open Touch-Ups */}
        {touchups.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-3">Open Touch-Ups</h2>
            <div className="space-y-2">
              {[...urgentTouchups, ...normalTouchups].map(t => (
                <div key={t.id} className={`flex items-start gap-3 bg-gray-900 border rounded-xl px-4 py-3 ${t.priority === 'urgent' ? 'border-red-800' : 'border-gray-800'}`}>
                  {t.priority === 'urgent' && <span className="text-[10px] font-semibold bg-red-800 text-red-200 px-1.5 py-0.5 rounded uppercase shrink-0">Urgent</span>}
                  <p className="text-sm text-white font-medium flex-1">{t.description}</p>
                  {t.assigned_to && <p className="text-xs text-gray-400 shrink-0">{t.assigned_to}</p>}
                  {t.address && <p className="text-xs text-gray-500 shrink-0">📍 {t.address}</p>}
                  <p className="text-xs text-gray-600 shrink-0">{daysSince(t.created_at)}d</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 3: Pending Questions */}
        {questions.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-3">Pending Questions ({questions.length})</h2>
            <div className="space-y-3">
              {Array.from(qByProject.entries()).map(([pid, qs]) => {
                const proj = projects.find(p => p.id === pid)
                const label = proj ? `${(proj.customer as Customer | undefined)?.name ?? 'Unknown'} — ${proj.project_type?.replace(/_/g, ' ') ?? 'Project'}` : 'Unknown Project'
                return (
                  <div key={pid} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-sm text-white">{label}</p>
                      <Link href={`/dashboard/projects/${pid}?view=shop`} className="text-xs text-amber-400 hover:text-amber-300 no-print">Go →</Link>
                    </div>
                    <div className="space-y-1">
                      {qs.map(q => (
                        <div key={q.id} className="flex items-start gap-2 text-xs">
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${q.directed_at === 'customer' ? 'bg-blue-900 text-blue-200' : 'bg-gray-700 text-gray-300'}`}>{q.directed_at}</span>
                          <span className="text-gray-300">{q.question}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Section 4: Materials Pending */}
        {pendingMaterials.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-3">Materials Pending</h2>
            <div className="space-y-3">
              {pendingMaterials.map(({ project: p, items }) => (
                <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-sm text-white">
                      {(p.customer as Customer | undefined)?.name ?? 'Unknown'} — {p.project_type?.replace(/_/g, ' ') ?? '—'}
                    </p>
                    <Link href={`/dashboard/projects/${p.id}?view=shop`} className="text-xs text-amber-400 hover:text-amber-300 no-print">Go →</Link>
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {items.map(m => (
                        <tr key={m.id} className="border-b border-gray-800 last:border-0">
                          <td className="py-1.5 text-gray-200">{m.item_name}</td>
                          <td className="py-1.5 text-gray-500 text-right">{m.cost_estimate != null ? `$${m.cost_estimate}` : '—'}</td>
                          <td className="py-1.5 pl-3">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.ordered ? 'bg-emerald-900 text-emerald-200' : 'bg-gray-700 text-gray-400'}`}>
                              {m.ordered ? 'Ordered' : 'Not Ordered'}
                            </span>
                          </td>
                          <td className="py-1.5 pl-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.received ? 'bg-emerald-900 text-emerald-200' : 'bg-gray-700 text-gray-400'}`}>
                              {m.received ? 'Received' : 'Not Received'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 5: Projects In Queue */}
        {inQueue.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-3">Projects In Queue</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Customer', 'Type', 'Days in Queue', 'Expected Delivery'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inQueue.map(p => (
                    <tr key={p.id} className="border-b border-gray-800 last:border-0">
                      <td className="px-3 py-2.5 font-medium text-white">{(p.customer as Customer | undefined)?.name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-400 capitalize text-xs">{p.project_type?.replace(/_/g, ' ') ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-300">{p.currentStep ? daysSince(p.currentStep.created_at) + 'd' : '—'}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {p.expected_delivery_end ? new Date(p.expected_delivery_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  )
}
