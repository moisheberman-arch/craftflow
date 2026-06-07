'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  getProjects, updateProject,
  getMaterialsByProjectId,
  getStepsByProjectId,
  getSubtasksByProjectId,
  getOpenQuestionsByProjectId,
  getUnresolvedQuestionsAllProjects,
  getCalendarEvents, addCalendarEvent, deleteCalendarEvent,
  getShopTaskProjects, type ShopTaskProject,
  autoAdvanceCurrentStep,
  getAllUnpurchasedShoppingItems,
  updateShoppingListItem,
  seedDefaultStepsIfEmpty,
} from '@/lib/api/supabase-client'
import type {
  Project, ProductionStep, MaterialItem, StepSubtask,
  OpenQuestion, CalendarEvent, CalendarEventType, ProjectStatus, ShoppingListItem,
} from '@/lib/core/types'

// ── Types ──────────────────────────────────────────────────────────────────

interface EnrichedProject extends Project {
  steps: ProductionStep[]
  stepsCompleted: number
  currentStep: ProductionStep | null
  nextStep: ProductionStep | null
  materialsTotal: number
  materialsOrdered: number
  materialsReceived: number
  openSubtasks: number
  unresolvedQuestions: number
  hasNoCurrentStep: boolean
  inQueue: boolean
  queueDays: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'deposit_received', label: 'Deposit Received' },
  { value: 'in_production', label: 'In Production' },
  { value: 'completed', label: 'Completed' },
]

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── Mini Calendar ──────────────────────────────────────────────────────────

function MiniCalendar({
  events, month, year, onMonthChange, onAddEvent, onDeleteEvent,
}: {
  events: CalendarEvent[]
  month: number
  year: number
  onMonthChange: (m: number, y: number) => void
  onAddEvent: (date: string) => void
  onDeleteEvent: (id: string) => void
}) {
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const eventsByDate: Record<string, CalendarEvent[]> = {}
  for (const ev of events) {
    const d = ev.event_date.slice(0, 10)
    if (!eventsByDate[d]) eventsByDate[d] = []
    eventsByDate[d].push(ev)
  }

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => month === 1 ? onMonthChange(12, year - 1) : onMonthChange(month - 1, year)}
          className="text-gray-400 hover:text-white px-1.5 py-0.5 rounded text-sm">◀</button>
        <h3 className="text-xs font-semibold text-white">{MONTH_NAMES[month - 1]} {year}</h3>
        <button onClick={() => month === 12 ? onMonthChange(1, year + 1) : onMonthChange(month + 1, year)}
          className="text-gray-400 hover:text-white px-1.5 py-0.5 rounded text-sm">▶</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="text-center text-[9px] font-medium text-gray-500 py-0.5">{d.slice(0,1)}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvents = eventsByDate[dateStr] ?? []
          const isToday = dateStr === todayStr
          return (
            <div
              key={i}
              onClick={() => onAddEvent(dateStr)}
              className={`rounded p-0.5 min-h-[30px] cursor-pointer transition-colors group ${isToday ? 'bg-blue-950 border border-blue-700' : 'hover:bg-gray-800'}`}
            >
              <span className={`text-[10px] font-medium block text-center ${isToday ? 'text-blue-300' : 'text-gray-400'}`}>{day}</span>
              {dayEvents.slice(0, 1).map(ev => (
                <div key={ev.id} className="relative group/ev">
                  <div className={`text-[8px] truncate px-0.5 rounded ${
                    ev.event_type === 'appointment' ? 'bg-amber-900 text-amber-200' :
                    ev.event_type === 'reminder' ? 'bg-orange-900 text-orange-200' :
                    ev.event_type === 'milestone' ? 'bg-emerald-900 text-emerald-200' :
                    'bg-gray-700 text-gray-300'
                  }`}>{ev.title}</div>
                  <button onClick={e => { e.stopPropagation(); onDeleteEvent(ev.id) }}
                    className="absolute -top-0.5 -right-0.5 hidden group-hover/ev:flex items-center justify-center w-3 h-3 bg-red-700 text-white rounded-full text-[8px]">×</button>
                </div>
              ))}
              {dayEvents.length > 1 && <div className="text-[8px] text-gray-500 text-center">+{dayEvents.length - 1}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Add Event Modal ────────────────────────────────────────────────────────

function AddEventModal({ date, onSave, onClose }: {
  date: string
  onSave: (event: CalendarEvent) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [eventType, setEventType] = useState<CalendarEventType>('appointment')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      const ev = await addCalendarEvent({ event_date: date, title: title.trim(), notes: notes || null, project_id: null, event_type: eventType })
      onSave(ev)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Add Event — {date}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input required placeholder="Event title" value={title} onChange={e => setTitle(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500" />
          <select value={eventType} onChange={e => setEventType(e.target.value as CalendarEventType)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
            <option value="appointment">Appointment</option>
            <option value="reminder">Reminder</option>
            <option value="milestone">Milestone</option>
            <option value="other">Other</option>
          </select>
          <textarea placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" />
          <div className="flex gap-3">
            <button type="submit" disabled={saving || !title.trim()}
              className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-semibold py-2 rounded-lg text-sm">
              {saving ? 'Saving...' : 'Add Event'}
            </button>
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Shopping List Panel ────────────────────────────────────────────────────

function ShoppingListPanel({ projects }: { projects: EnrichedProject[] }) {
  const [items, setItems] = useState<ShoppingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)

  useEffect(() => {
    getAllUnpurchasedShoppingItems()
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handlePurchased(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setMarkingId(id)
    try {
      await updateShoppingListItem(id, { purchased: true })
      setItems(prev => prev.filter(i => i.id !== id))
    } finally {
      setMarkingId(null)
    }
  }

  // Group items by project
  const byProject = new Map<string, ShoppingListItem[]>()
  for (const item of items) {
    if (!byProject.has(item.project_id)) byProject.set(item.project_id, [])
    byProject.get(item.project_id)!.push(item)
  }

  function getProjectLabel(item: ShoppingListItem): string {
    const p = item.project as (Project & { customer?: { name: string } }) | undefined
    if (!p) {
      const ep = projects.find(proj => proj.id === item.project_id)
      if (ep) return `${ep.customer?.name ?? 'Unknown'} — ${ep.project_type?.replace(/_/g, ' ') ?? 'Project'}`
      return 'Unknown Project'
    }
    return `${p.customer?.name ?? 'Unknown'} — ${p.project_type?.replace(/_/g, ' ') ?? 'Project'}`
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between mb-1"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-200">Shopping List</h2>
          {items.length > 0 && (
            <span className="text-xs bg-amber-800 text-amber-200 font-bold px-1.5 py-0.5 rounded-full">{items.length}</span>
          )}
        </div>
        <span className="text-gray-500 text-xs">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="mt-2">
          {loading ? (
            <p className="text-xs text-gray-600 py-1">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-gray-600 py-1">No unpurchased items.</p>
          ) : (
            <div className="space-y-3">
              {Array.from(byProject.entries()).map(([pid, pidItems]) => {
                const label = getProjectLabel(pidItems[0])
                return (
                  <div key={pid}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 truncate">{label}</p>
                    <div className="space-y-0.5">
                      {pidItems.map(item => (
                        <label
                          key={item.id}
                          className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white group"
                        >
                          <input
                            type="checkbox"
                            className="w-3 h-3 rounded border-gray-600 bg-gray-800 accent-amber-500 cursor-pointer"
                            checked={false}
                            onChange={e => handlePurchased(item.id, e as unknown as React.MouseEvent)}
                            disabled={markingId === item.id}
                          />
                          <span className={`truncate flex-1 ${markingId === item.id ? 'opacity-50' : ''}`}>{item.item}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Project Card ───────────────────────────────────────────────────────────

function ProjectCard({
  p,
  onNavigate,
  onProjectUpdated,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  p: EnrichedProject
  onNavigate: (id: string) => void
  onProjectUpdated: (id: string, updates: Partial<EnrichedProject>) => void
  isDragOver: boolean
  onDragStart: (id: string) => void
  onDragOver: (id: string) => void
  onDrop: (toId: string) => void
  onDragEnd: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [savingStatus, setSavingStatus] = useState(false)

  const deliveryEnd = p.expected_delivery_end
  const daysLeft = deliveryEnd ? Math.ceil((new Date(deliveryEnd).getTime() - Date.now()) / 86400000) : null
  const deliveryLabel = deliveryEnd ? new Date(deliveryEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
  const deliveryColor = daysLeft === null ? '' : daysLeft < 0 ? 'bg-red-900 text-red-200' : daysLeft <= 14 ? 'bg-orange-900 text-orange-200' : 'bg-emerald-900 text-emerald-200'

  const upcomingSteps = p.steps.filter(s => !s.completed && !s.is_current).slice(0, 3)

  async function handleCompleteStep(e: React.MouseEvent) {
    e.stopPropagation()
    if (!p.currentStep || completing) return
    setCompleting(true)
    try {
      const result = await autoAdvanceCurrentStep(p.id, p.currentStep.id)
      const newCurrentStep = result.nextStep
      const updatedSteps = p.steps.map(s => {
        if (s.id === p.currentStep!.id) return { ...s, completed: true, is_current: false }
        if (newCurrentStep && s.id === newCurrentStep.id) return { ...s, is_current: true }
        return s
      })
      const newNextStep = newCurrentStep
        ? updatedSteps.find(s => !s.completed && !s.is_current && (s.sequence_order ?? 0) > (newCurrentStep.sequence_order ?? 0)) ?? null
        : null
      onProjectUpdated(p.id, {
        steps: updatedSteps,
        stepsCompleted: updatedSteps.filter(s => s.completed).length,
        currentStep: newCurrentStep,
        nextStep: newNextStep,
        hasNoCurrentStep: !newCurrentStep,
      })
      const stepName = result.nextStep?.step_name ?? 'All steps done!'
      setToast(`Step complete — now: ${stepName}`)
      setTimeout(() => setToast(null), 3500)
    } catch (err) {
      console.error(err)
    } finally {
      setCompleting(false)
    }
  }

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation()
    const newStatus = e.target.value as ProjectStatus
    setSavingStatus(true)
    try {
      await updateProject(p.id, { status: newStatus })
      onProjectUpdated(p.id, { status: newStatus })
      if (newStatus === 'deposit_received') {
        seedDefaultStepsIfEmpty(p.id).catch(console.error)
      }
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(p.id)}
      onDragOver={e => { e.preventDefault(); onDragOver(p.id) }}
      onDrop={e => { e.preventDefault(); onDrop(p.id) }}
      onDragEnd={onDragEnd}
      onClick={() => onNavigate(p.id)}
      className={`relative bg-gray-900 border rounded-xl p-4 cursor-pointer transition-colors select-none ${
        isDragOver ? 'border-amber-500 ring-1 ring-amber-500/50' : 'border-gray-800 hover:border-blue-700'
      }`}
    >
      {/* Toast */}
      {toast && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-emerald-800 text-emerald-100 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap"
          onClick={e => e.stopPropagation()}
        >
          ✓ {toast}
        </div>
      )}

      {/* Top row: drag handle + name + badges */}
      <div className="flex items-start gap-2 mb-3">
        <span
          className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing mt-0.5 shrink-0 text-base leading-none"
          onClick={e => e.stopPropagation()}
          title="Drag to reorder"
        >⠿</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-base truncate">{p.customer?.name ?? 'No customer'}</p>
          <p className="text-sm text-gray-400 capitalize">{p.project_type?.replace(/_/g, ' ') ?? '—'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 justify-end shrink-0">
          {deliveryLabel && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${deliveryColor}`}>
              {daysLeft !== null && daysLeft < 0 ? '⚠ ' : ''}{deliveryLabel}
            </span>
          )}
          {p.openSubtasks > 0 && (
            <span className="text-[10px] bg-red-900 text-red-200 px-1.5 py-0.5 rounded font-semibold">{p.openSubtasks} subtasks</span>
          )}
          {p.unresolvedQuestions > 0 && (
            <span className="text-[10px] bg-orange-900 text-orange-200 px-1.5 py-0.5 rounded font-semibold">{p.unresolvedQuestions} Qs</span>
          )}
        </div>
      </div>

      {/* Current Step section */}
      {p.currentStep ? (
        <div className="bg-blue-950/30 border border-blue-800/60 rounded-lg px-3 py-2 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-blue-200 truncate flex-1">{p.currentStep.step_name}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0 ${
              p.currentStep.step_type === 'waiting' ? 'bg-orange-900 text-orange-200' : 'bg-emerald-900 text-emerald-200'
            }`}>{p.currentStep.step_type}</span>
            {p.currentStep.waiting_on && (
              <span className="text-[10px] text-orange-300 shrink-0">({p.currentStep.waiting_on})</span>
            )}
          </div>
          {p.nextStep && (
            <p className="text-xs text-gray-500 mb-2">Next: {p.nextStep.step_name}</p>
          )}
          <button
            onClick={handleCompleteStep}
            disabled={completing}
            className="w-full text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-emerald-100 py-1.5 rounded-md transition-colors"
          >
            {completing ? 'Saving...' : '✓ Complete & Advance'}
          </button>
        </div>
      ) : (
        <div className="bg-red-950/30 border border-red-800/60 rounded-lg px-3 py-2 mb-3">
          <p className="text-xs text-red-400">No active step — click to set one</p>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-gray-500 mb-0.5">
          <span>Steps</span>
          <span>{p.stepsCompleted}/{p.steps.length}</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full"
            style={{ width: p.steps.length > 0 ? `${(p.stepsCompleted / p.steps.length) * 100}%` : '0%' }} />
        </div>
      </div>

      {/* Status + expand row */}
      <div className="flex items-center justify-between mt-3">
        <select
          value={p.status ?? ''}
          onChange={handleStatusChange}
          onClick={e => e.stopPropagation()}
          disabled={savingStatus}
          className="text-[10px] font-semibold bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-gray-300 focus:outline-none disabled:opacity-50 cursor-pointer"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
        >
          {expanded ? '▲ Hide' : '▼ Details'}
        </button>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div
          className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-2 gap-3"
          onClick={e => e.stopPropagation()}
        >
          {/* Left: Steps Summary */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Steps</p>
            {upcomingSteps.length > 0 ? (
              <div className="space-y-0.5">
                {upcomingSteps.map(s => (
                  <p key={s.id} className="text-[10px] text-gray-400 truncate">· {s.step_name}</p>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-gray-600">No upcoming steps</p>
            )}
            {p.openSubtasks > 0 && (
              <span className="mt-1.5 inline-block text-[10px] bg-red-900 text-red-200 px-1.5 py-0.5 rounded font-semibold">
                {p.openSubtasks} open subtasks
              </span>
            )}
          </div>

          {/* Right: Materials Summary */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Materials</p>
            <p className="text-[10px] text-gray-400">{p.materialsOrdered}/{p.materialsTotal} ordered</p>
            <p className="text-[10px] text-gray-400">{p.materialsReceived}/{p.materialsTotal} received</p>
            {p.unresolvedQuestions > 0 && (
              <span className="mt-1.5 inline-block text-[10px] bg-orange-900 text-orange-200 px-1.5 py-0.5 rounded font-semibold">
                {p.unresolvedQuestions} open Qs
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── In-Queue Row ───────────────────────────────────────────────────────────

function QueueRow({
  p,
  onNavigate,
  onProjectUpdated,
  onStartProduction,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  p: EnrichedProject
  onNavigate: (id: string) => void
  onProjectUpdated: (id: string, updates: Partial<EnrichedProject>) => void
  onStartProduction: (p: EnrichedProject) => void
  isDragOver: boolean
  onDragStart: (id: string) => void
  onDragOver: (id: string) => void
  onDrop: (toId: string) => void
  onDragEnd: () => void
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(p.id)}
      onDragOver={e => { e.preventDefault(); onDragOver(p.id) }}
      onDrop={e => { e.preventDefault(); onDrop(p.id) }}
      onDragEnd={onDragEnd}
      onClick={() => onNavigate(p.id)}
      className={`bg-gray-900 border rounded-xl px-4 py-3 flex items-center gap-4 cursor-pointer transition-colors ${
        isDragOver ? 'border-amber-500 ring-1 ring-amber-500/50' : 'border-gray-800 hover:border-blue-700'
      }`}
    >
      <span
        className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0 text-base"
        onClick={e => e.stopPropagation()}
        title="Drag to reorder"
      >⠿</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white">
          {p.customer?.name ?? 'No customer'}
          <span className="text-gray-400 font-normal ml-2 text-sm capitalize">
            — {p.project_type?.replace(/_/g, ' ') ?? '—'}
          </span>
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          In queue {p.queueDays} {p.queueDays === 1 ? 'day' : 'days'}
          {p.steps.length > 0 && ` · ${p.stepsCompleted}/${p.steps.length} steps pre-production`}
        </p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onStartProduction(p) }}
        className="text-xs bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0"
      >
        Start Production
      </button>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function ShopDashboard() {
  const router = useRouter()
  const [projects, setProjects] = useState<EnrichedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingQuestions, setPendingQuestions] = useState<OpenQuestion[]>([])
  const [questionsCollapsed, setQuestionsCollapsed] = useState(false)

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1)
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [addingEventDate, setAddingEventDate] = useState<string | null>(null)

  // Today's tasks
  const [taskProjects, setTaskProjects] = useState<ShopTaskProject[]>([])

  // Drag state (shared, one card dragged at a time)
  const dragId = useRef<string | null>(null)
  const dragSection = useRef<'production' | 'queue' | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [allProjects, allQuestions, tasks] = await Promise.all([
        getProjects(),
        getUnresolvedQuestionsAllProjects().catch(() => [] as OpenQuestion[]),
        getShopTaskProjects().catch(() => [] as ShopTaskProject[]),
      ])
      setPendingQuestions(allQuestions)
      setTaskProjects(tasks)

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
          materialsOrdered: materials.filter(m => m.ordered).length,
          materialsReceived: materials.filter(m => m.received).length,
          openSubtasks: subtasks.filter(s => !s.completed).length,
          unresolvedQuestions: questions.filter(q => !q.resolved).length,
          hasNoCurrentStep: !currentStep,
          inQueue,
          queueDays: inQueue && currentStep ? daysSince(currentStep.created_at) : 0,
        } as EnrichedProject
      }))

      setProjects(enriched.sort((a, b) => {
        const posA = a.queue_position ?? 9999
        const posB = b.queue_position ?? 9999
        if (posA !== posB) return posA - posB
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }))
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    getCalendarEvents(calMonth, calYear).then(setEvents).catch(console.error)
  }, [calMonth, calYear])

  function handleProjectUpdated(id: string, updates: Partial<EnrichedProject>) {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  function handleNavigate(id: string) {
    router.push(`/dashboard/projects/${id}?view=shop`)
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

  // ── Drag handlers ──────────────────────────────────────────────────────

  function handleDragStart(section: 'production' | 'queue', id: string) {
    dragId.current = id
    dragSection.current = section
  }

  function handleDragOver(section: 'production' | 'queue', id: string) {
    if (dragSection.current === section) setDragOverId(id)
  }

  async function handleDrop(section: 'production' | 'queue', toId: string) {
    const fromId = dragId.current
    if (!fromId || fromId === toId || dragSection.current !== section) return

    const sectionList = section === 'production' ? inProduction : inQueue
    const fromIdx = sectionList.findIndex(p => p.id === fromId)
    const toIdx = sectionList.findIndex(p => p.id === toId)
    if (fromIdx === -1 || toIdx === -1) return

    const reordered = [...sectionList]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)

    const basePos = section === 'production' ? 1 : 1001
    const withPositions = reordered.map((p, i) => ({ ...p, queue_position: basePos + i }))

    const other = section === 'production' ? inQueue : inProduction
    setProjects([...withPositions, ...other].sort((a, b) => (a.queue_position ?? 999) - (b.queue_position ?? 999)))

    await Promise.all(withPositions.map(p => updateProject(p.id, { queue_position: p.queue_position ?? null }))).catch(console.error)
  }

  function handleDragEnd() {
    dragId.current = null
    dragSection.current = null
    setDragOverId(null)
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>

  const inProduction = projects.filter(p => !p.inQueue)
  const inQueue = projects.filter(p => p.inQueue)

  const qByProject = new Map<string, OpenQuestion[]>()
  for (const q of pendingQuestions) {
    if (!qByProject.has(q.project_id)) qByProject.set(q.project_id, [])
    qByProject.get(q.project_id)!.push(q)
  }

  const actionTasks = taskProjects.filter(t => t.currentStep.step_type === 'action')
  const waitingTasks = taskProjects.filter(t => t.currentStep.step_type === 'waiting')

  return (
    <div className="flex gap-5 items-start">

      {/* ── LEFT PANEL: Project Tiles (65%) ── */}
      <div className="flex-1 min-w-0 space-y-6">

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

        {/* In Production — 3-column tile grid */}
        {inProduction.length > 0 && (
          <div>
            <h2 className="font-bold text-white mb-3 flex items-center gap-2">
              In Production
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{inProduction.length}</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inProduction.map(p => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  onNavigate={handleNavigate}
                  onProjectUpdated={handleProjectUpdated}
                  isDragOver={dragOverId === p.id}
                  onDragStart={id => handleDragStart('production', id)}
                  onDragOver={id => handleDragOver('production', id)}
                  onDrop={toId => handleDrop('production', toId)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </div>
        )}

        {/* Up Next — In Queue */}
        {inQueue.length > 0 && (
          <div>
            <h2 className="font-bold text-white mb-3 flex items-center gap-2">
              Up Next — In Queue
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{inQueue.length}</span>
            </h2>
            <div className="space-y-2">
              {inQueue.map(p => (
                <QueueRow
                  key={p.id}
                  p={p}
                  onNavigate={handleNavigate}
                  onProjectUpdated={handleProjectUpdated}
                  onStartProduction={handleStartProduction}
                  isDragOver={dragOverId === p.id}
                  onDragStart={id => handleDragStart('queue', id)}
                  onDragOver={id => handleDragOver('queue', id)}
                  onDrop={toId => handleDrop('queue', toId)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </div>
        )}

        {projects.length === 0 && (
          <div className="text-center text-gray-500 py-12">No active production projects</div>
        )}
      </div>

      {/* ── RIGHT PANEL: Calendar + Tasks + Shopping List (35%) — sticky ── */}
      <div className="w-80 xl:w-96 shrink-0 sticky top-6 space-y-4 max-h-[calc(100vh-80px)] overflow-y-auto">

        {/* Calendar section (~50%) */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-200">Calendar</h2>
            <button onClick={() => setAddingEventDate(
              `${calYear}-${String(calMonth).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
            )} className="text-xs text-amber-400 hover:text-amber-300">+ Add Event</button>
          </div>
          <MiniCalendar
            events={events}
            month={calMonth}
            year={calYear}
            onMonthChange={(m, y) => { setCalMonth(m); setCalYear(y) }}
            onAddEvent={date => setAddingEventDate(date)}
            onDeleteEvent={async (id) => {
              await deleteCalendarEvent(id).catch(console.error)
              setEvents(prev => prev.filter(e => e.id !== id))
            }}
          />
          {events.length > 0 && (
            <div className="mt-2 space-y-1">
              {events.slice(0, 4).map(ev => (
                <div key={ev.id} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 shrink-0 w-10">{ev.event_date.slice(5).replace('-', '/')}</span>
                  <span className="text-gray-300 truncate flex-1">{ev.title}</span>
                </div>
              ))}
              {events.length > 4 && <p className="text-[10px] text-gray-600">+{events.length - 4} more this month</p>}
            </div>
          )}
        </div>

        {/* Today's Tasks section (~30%) */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-200">
              Today&apos;s Tasks
              {taskProjects.length > 0 && (
                <span className="ml-1.5 text-xs text-gray-500">({taskProjects.length})</span>
              )}
            </h2>
            <Link href="/dashboard/shop/tasks" className="text-xs text-amber-400 hover:text-amber-300">See all →</Link>
          </div>

          {taskProjects.length === 0 ? (
            <p className="text-xs text-gray-600 py-2">No active steps set.</p>
          ) : (
            <div className="space-y-3">
              {actionTasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Action Required</span>
                    <span className="text-[10px] text-gray-600">({actionTasks.length})</span>
                  </div>
                  <div className="space-y-1">
                    {actionTasks.map(t => (
                      <Link
                        key={t.project.id}
                        href={`/dashboard/projects/${t.project.id}?view=shop`}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        <span className="text-[10px] font-semibold bg-emerald-900 text-emerald-200 px-1 py-0.5 rounded uppercase shrink-0">act</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white truncate">
                            {t.project.customer?.name ?? 'Unknown'}
                            {t.project.project_type && <span className="text-gray-500 font-normal"> — {t.project.project_type.replace(/_/g, ' ')}</span>}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate">{t.currentStep.step_name}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {waitingTasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Waiting On</span>
                    <span className="text-[10px] text-gray-600">({waitingTasks.length})</span>
                  </div>
                  <div className="space-y-1">
                    {waitingTasks.map(t => (
                      <Link
                        key={t.project.id}
                        href={`/dashboard/projects/${t.project.id}?view=shop`}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        <span className="text-[10px] font-semibold bg-orange-900 text-orange-200 px-1 py-0.5 rounded uppercase shrink-0">wait</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white truncate">
                            {t.project.customer?.name ?? 'Unknown'}
                            {t.project.project_type && <span className="text-gray-500 font-normal"> — {t.project.project_type.replace(/_/g, ' ')}</span>}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {t.currentStep.step_name}
                            {t.currentStep.waiting_on && <span className="text-orange-400/70"> · {t.currentStep.waiting_on}</span>}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Shopping List section (~20%, collapsed by default) */}
        <ShoppingListPanel projects={projects} />
      </div>

      {/* Add Event Modal */}
      {addingEventDate && (
        <AddEventModal
          date={addingEventDate}
          onSave={ev => { setEvents(prev => [...prev, ev].sort((a, b) => a.event_date.localeCompare(b.event_date))); setAddingEventDate(null) }}
          onClose={() => setAddingEventDate(null)}
        />
      )}
    </div>
  )
}
