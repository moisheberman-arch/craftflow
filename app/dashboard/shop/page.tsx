'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  getProjects, updateProject,
  getMaterialsByProjectId,
  getStepsByProjectId,
  getSubtasksByProjectId,
  getOpenQuestionsByProjectId,
  getUnresolvedQuestionsAllProjects,
} from '@/lib/api/supabase-client'
import type { Project, ProductionStep, MaterialItem, StepSubtask, OpenQuestion } from '@/lib/core/types'

interface EnrichedProject extends Project {
  steps: ProductionStep[]
  stepsCompleted: number
  currentStep: ProductionStep | null
  nextStep: ProductionStep | null
  materialsTotal: number
  materialsReceived: number
  openSubtasks: number
  unresolvedQuestions: number
  hasNoCurrentStep: boolean
  inQueue: boolean
  queueDays: number
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function DeliveryBadge({ project }: { project: Project }) {
  if (!project.expected_delivery_end) return null
  const end = new Date(project.expected_delivery_end)
  const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86400000)
  const label = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (daysLeft < 0) {
    return <span className="text-[10px] font-semibold bg-red-900 text-red-200 px-1.5 py-0.5 rounded">⚠ {label}</span>
  }
  if (daysLeft <= 14) {
    return <span className="text-[10px] font-semibold bg-orange-900 text-orange-200 px-1.5 py-0.5 rounded">📅 {label}</span>
  }
  return <span className="text-[10px] font-semibold bg-emerald-900 text-emerald-200 px-1.5 py-0.5 rounded">📅 {label}</span>
}

function StepBadge({ step }: { step: ProductionStep | null }) {
  if (!step) return <span className="text-[10px] text-red-400 font-semibold">No active step</span>
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className={`text-[10px] font-semibold px-1 py-0.5 rounded uppercase shrink-0 ${
        step.step_type === 'waiting' ? 'bg-orange-900 text-orange-200' : 'bg-emerald-900 text-emerald-200'
      }`}>{step.step_type}</span>
      <span className="text-xs text-gray-300 truncate">{step.step_name}</span>
    </span>
  )
}

export default function ShopDashboard() {
  const router = useRouter()
  const [projects, setProjects] = useState<EnrichedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingQuestions, setPendingQuestions] = useState<OpenQuestion[]>([])
  const [questionsCollapsed, setQuestionsCollapsed] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [allProjects, allQuestions] = await Promise.all([
        getProjects(),
        getUnresolvedQuestionsAllProjects().catch(() => [] as OpenQuestion[]),
      ])
      setPendingQuestions(allQuestions)

      const active = allProjects.filter(
        p => p.status === 'in_production' || p.status === 'deposit_received'
      )

      const enriched = await Promise.all(active.map(async p => {
        const [steps, materials, subtasks, questions] = await Promise.all([
          getStepsByProjectId(p.id).catch(() => [] as ProductionStep[]),
          getMaterialsByProjectId(p.id).catch(() => [] as MaterialItem[]),
          getSubtasksByProjectId(p.id).catch(() => [] as StepSubtask[]),
          getOpenQuestionsByProjectId(p.id).catch(() => [] as OpenQuestion[]),
        ])
        const currentStep = steps.find(s => s.is_current) ?? null
        const nextStep = currentStep
          ? steps.find(s => !s.completed && !s.is_current && (s.sequence_order ?? 0) > (currentStep.sequence_order ?? 0)) ?? null
          : steps.find(s => !s.completed) ?? null
        const inQueue = currentStep?.step_name === 'Ready for Production — In Queue'
        return {
          ...p,
          steps,
          stepsCompleted: steps.filter(s => s.completed).length,
          currentStep,
          nextStep,
          materialsTotal: materials.length,
          materialsReceived: materials.filter(m => m.received).length,
          openSubtasks: subtasks.filter(s => !s.completed).length,
          unresolvedQuestions: questions.filter(q => !q.resolved).length,
          hasNoCurrentStep: !currentStep,
          inQueue,
          queueDays: inQueue && currentStep ? daysSince(currentStep.created_at) : 0,
        } as EnrichedProject
      }))

      setProjects(enriched.sort((a, b) => (a.queue_position ?? 999) - (b.queue_position ?? 999)))
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  const inProduction = projects.filter(p => !p.inQueue)
  const inQueue = projects.filter(p => p.inQueue)

  function handleDragStart(id: string) { setDragId(id) }
  function handleDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOver(id) }
  async function handleDrop(targetId: string, section: 'production' | 'queue') {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOver(null); return }
    const list = section === 'production' ? [...inProduction] : [...inQueue]
    const fromIdx = list.findIndex(p => p.id === dragId)
    const toIdx = list.findIndex(p => p.id === targetId)
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOver(null); return }
    const [moved] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, moved)
    const updated = list.map((p, i) => ({ ...p, queue_position: i + 1 }))
    setProjects(prev => {
      const other = prev.filter(p => section === 'production' ? p.inQueue : !p.inQueue)
      return [...other, ...updated]
    })
    await Promise.all(updated.map((p, i) => updateProject(p.id, { queue_position: i + 1 })))
    setDragId(null); setDragOver(null)
  }

  async function handleStartProduction(p: EnrichedProject) {
    const queueStep = p.steps.find(s => s.step_name === 'Ready for Production — In Queue')
    const productionStep = p.steps.find(s => s.step_name === 'Production Started')
    const { updateStep } = await import('@/lib/api/supabase-client')
    if (queueStep) await updateStep(queueStep.id, { completed: true, is_current: false })
    if (productionStep) await updateStep(productionStep.id, { is_current: true })
    await updateProject(p.id, { status: 'in_production' })
    router.refresh()
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>

  const qByProject = new Map<string, OpenQuestion[]>()
  for (const q of pendingQuestions) {
    if (!qByProject.has(q.project_id)) qByProject.set(q.project_id, [])
    qByProject.get(q.project_id)!.push(q)
  }

  // Row component for compact list
  function ProjectRow({ p, section }: { p: EnrichedProject; section: 'production' | 'queue' }) {
    const hasIssues = p.openSubtasks > 0 || p.unresolvedQuestions > 0
    return (
      <div
        draggable
        onDragStart={() => handleDragStart(p.id)}
        onDragOver={e => handleDragOver(e, p.id)}
        onDrop={() => handleDrop(p.id, section)}
        onDragEnd={() => { setDragId(null); setDragOver(null) }}
        className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-800 last:border-0 cursor-grab transition-colors ${
          dragOver === p.id ? 'bg-amber-950/30' : 'hover:bg-gray-800/40'
        } ${dragId === p.id ? 'opacity-40' : ''}`}
      >
        <span className="text-gray-600 text-sm select-none shrink-0">⋮⋮</span>

        <Link
          href={`/dashboard/projects/${p.id}?view=shop`}
          className="font-semibold text-white hover:text-amber-400 text-sm shrink-0 min-w-[160px] max-w-[200px] truncate"
          onClick={e => e.stopPropagation()}
        >
          {p.customer?.name ?? 'No customer'}
          {p.project_type && (
            <span className="text-gray-400 font-normal ml-1 capitalize">— {p.project_type.replace(/_/g, ' ')}</span>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <StepBadge step={p.currentStep} />
        </div>

        <DeliveryBadge project={p} />

        {hasIssues && (
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title={`${p.openSubtasks} subtasks · ${p.unresolvedQuestions} questions`} />
        )}

        {section === 'queue' && (
          <button
            onClick={e => { e.preventDefault(); handleStartProduction(p) }}
            className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold px-2.5 py-1 rounded shrink-0"
          >
            Start
          </button>
        )}

        <Link
          href={`/dashboard/projects/${p.id}?view=shop`}
          className="text-xs text-gray-500 hover:text-gray-300 shrink-0"
          onClick={e => e.stopPropagation()}
        >
          →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Shop Dashboard</h1>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/shop/tasks"
            className="text-sm bg-blue-800 hover:bg-blue-700 text-blue-200 px-4 py-2 rounded-lg transition-colors font-medium">
            ✓ Tasks
          </Link>
          <Link href="/dashboard/shop/shopping-list"
            className="text-sm bg-emerald-800 hover:bg-emerald-700 text-emerald-200 px-4 py-2 rounded-lg transition-colors font-medium">
            🛒 Shopping List
          </Link>
        </div>
      </div>

      {/* Pending Questions Banner */}
      {pendingQuestions.length > 0 && (
        <div className="bg-orange-950/40 border border-orange-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-orange-800/60">
            <div className="flex items-center gap-2">
              <span className="text-orange-400 font-semibold text-sm">⚠ Pending Questions</span>
              <span className="bg-orange-800 text-orange-200 text-xs font-bold px-2 py-0.5 rounded-full">{pendingQuestions.length}</span>
            </div>
            <button onClick={() => setQuestionsCollapsed(v => !v)} className="text-orange-400 hover:text-orange-300 text-xs">
              {questionsCollapsed ? 'Show' : 'Hide'}
            </button>
          </div>
          {!questionsCollapsed && (
            <div className="divide-y divide-orange-900/40">
              {Array.from(qByProject.entries()).map(([pid, qs]) => {
                const proj = projects.find(p => p.id === pid)
                const label = proj ? `${proj.customer?.name ?? 'Unknown'} — ${proj.project_type?.replace(/_/g, ' ') ?? 'Project'}` : 'Unknown Project'
                return (
                  <div key={pid} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-orange-200">{label}</span>
                      <Link href={`/dashboard/projects/${pid}?view=shop`} className="text-xs text-amber-400 hover:text-amber-300">Go →</Link>
                    </div>
                    <div className="space-y-0.5">
                      {qs.map(q => (
                        <div key={q.id} className="flex items-center gap-2 text-xs text-orange-100">
                          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${q.directed_at === 'customer' ? 'bg-blue-900 text-blue-200' : 'bg-gray-700 text-gray-300'}`}>{q.directed_at}</span>
                          <span>{q.question}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* In Production — compact list */}
      {inProduction.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="font-bold text-white">In Production</h2>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{inProduction.length}</span>
            <span className="text-xs text-gray-600 font-normal">Drag to reorder</span>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {inProduction.map(p => <ProjectRow key={p.id} p={p} section="production" />)}
          </div>
        </div>
      )}

      {/* Up Next — In Queue */}
      {inQueue.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="font-bold text-white">Up Next — In Queue</h2>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{inQueue.length}</span>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {inQueue.map(p => <ProjectRow key={p.id} p={p} section="queue" />)}
          </div>
        </div>
      )}

      {projects.length === 0 && (
        <div className="text-center text-gray-500 py-12">No active production projects</div>
      )}
    </div>
  )
}
