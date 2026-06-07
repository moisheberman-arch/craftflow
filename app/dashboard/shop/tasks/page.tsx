'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getShopTaskProjects, getCalendarEvents, addCalendarEvent, deleteCalendarEvent,
  getOpenTouchups,
  type ShopTaskProject,
} from '@/lib/api/supabase-client'
import type { CalendarEvent, CalendarEventType, Touchup } from '@/lib/core/types'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatAge(hours: number): string {
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function getWaitingColor(waitingOn: string | null): string {
  const map: Record<string, string> = {
    customer: 'bg-blue-900 text-blue-200',
    supplier: 'bg-purple-900 text-purple-200',
    designer: 'bg-pink-900 text-pink-200',
    internal: 'bg-gray-700 text-gray-300',
  }
  return map[waitingOn ?? ''] ?? 'bg-gray-700 text-gray-300'
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── Calendar ───────────────────────────────────────────────────────────────

function MiniCalendar({
  events,
  month,
  year,
  onMonthChange,
  onAddEvent,
  onDeleteEvent,
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

  // Group events by date
  const eventsByDate: Record<string, CalendarEvent[]> = {}
  for (const ev of events) {
    const d = ev.event_date.slice(0, 10)
    if (!eventsByDate[d]) eventsByDate[d] = []
    eventsByDate[d].push(ev)
  }

  function prevMonth() {
    if (month === 1) onMonthChange(12, year - 1)
    else onMonthChange(month - 1, year)
  }
  function nextMonth() {
    if (month === 12) onMonthChange(1, year + 1)
    else onMonthChange(month + 1, year)
  }

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="text-gray-400 hover:text-white px-2 py-1 rounded">◀</button>
        <h3 className="text-sm font-semibold text-white">{MONTH_NAMES[month - 1]} {year}</h3>
        <button onClick={nextMonth} className="text-gray-400 hover:text-white px-2 py-1 rounded">▶</button>
      </div>
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-500 py-1">{d}</div>
        ))}
      </div>
      {/* Cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvents = eventsByDate[dateStr] ?? []
          const isToday = dateStr === todayStr
          return (
            <div
              key={i}
              className={`rounded-lg p-1 min-h-[48px] cursor-pointer transition-colors group ${isToday ? 'bg-blue-950 border border-blue-700' : 'hover:bg-gray-800'}`}
              onClick={() => onAddEvent(dateStr)}
            >
              <span className={`text-xs font-medium block text-center mb-1 ${isToday ? 'text-blue-300' : 'text-gray-300'}`}>
                {day}
              </span>
              {dayEvents.slice(0, 2).map(ev => (
                <div key={ev.id} className="relative group/ev">
                  <div className={`text-[9px] truncate px-1 py-0.5 rounded mb-0.5 ${
                    ev.event_type === 'appointment' ? 'bg-amber-900 text-amber-200' :
                    ev.event_type === 'reminder' ? 'bg-orange-900 text-orange-200' :
                    ev.event_type === 'milestone' ? 'bg-emerald-900 text-emerald-200' :
                    'bg-gray-700 text-gray-300'
                  }`}>
                    {ev.title}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); onDeleteEvent(ev.id) }}
                    className="absolute -top-0.5 -right-0.5 hidden group-hover/ev:flex items-center justify-center w-3 h-3 bg-red-700 text-white rounded-full text-[8px] leading-none"
                  >×</button>
                </div>
              ))}
              {dayEvents.length > 2 && (
                <div className="text-[9px] text-gray-500">+{dayEvents.length - 2} more</div>
              )}
              <div className="hidden group-hover:block text-[9px] text-gray-600 text-center mt-0.5">+ add</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Add Event Modal ────────────────────────────────────────────────────────

function AddEventModal({
  date,
  onSave,
  onClose,
}: {
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
    } finally {
      setSaving(false)
    }
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

// ── Task Card ──────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: ShopTaskProject }) {
  const { project, currentStep, openSubtasks, unresolvedQuestions, stepAgeHours } = task
  const label = `${project.customer?.name ?? 'Unknown'} — ${project.project_type?.replace(/_/g, ' ') ?? 'Project'}`

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={`/dashboard/projects/${project.id}?view=shop`}
            className="font-semibold text-white hover:text-amber-400 transition-colors text-sm"
          >
            {label}
          </Link>
          <p className="text-base font-bold text-white mt-1">{currentStep.step_name}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {openSubtasks > 0 && (
            <span className="text-[10px] font-semibold bg-red-900 text-red-200 px-1.5 py-0.5 rounded">{openSubtasks} subtasks</span>
          )}
          {unresolvedQuestions > 0 && (
            <span className="text-[10px] font-semibold bg-orange-900 text-orange-200 px-1.5 py-0.5 rounded">{unresolvedQuestions} Qs</span>
          )}
        </div>
      </div>

      {currentStep.step_type === 'waiting' && currentStep.waiting_on && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Waiting on:</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${getWaitingColor(currentStep.waiting_on)}`}>
            {currentStep.waiting_on}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">On this step {formatAge(stepAgeHours)}</span>
        <Link
          href={`/dashboard/projects/${project.id}?view=shop`}
          className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          Go to Project →
        </Link>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ShopTasksPage() {
  const [tasks, setTasks] = useState<ShopTaskProject[]>([])
  const [touchups, setTouchups] = useState<Touchup[]>([])
  const [loading, setLoading] = useState(true)
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1)
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [addingEventDate, setAddingEventDate] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getShopTaskProjects().catch(() => [] as ShopTaskProject[]),
      getOpenTouchups().catch(() => [] as Touchup[]),
    ]).then(([t, tu]) => {
      setTasks(t)
      setTouchups(tu)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    getCalendarEvents(calMonth, calYear)
      .then(setEvents)
      .catch(console.error)
  }, [calMonth, calYear])

  const actionTasks = tasks.filter(t => t.currentStep.step_type === 'action')
  const waitingTasks = tasks.filter(t => t.currentStep.step_type === 'waiting')

  // Waiting summary
  const waitingSummary = (['customer', 'supplier', 'designer', 'internal'] as const)
    .map(w => ({ label: w, count: waitingTasks.filter(t => t.currentStep.waiting_on === w).length }))
    .filter(x => x.count > 0)

  return (
    <div className="flex gap-6 h-full">
      {/* ── LEFT: Task List ── */}
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/shop" className="text-gray-500 hover:text-gray-300 text-sm">← Shop</Link>
            <h1 className="text-xl font-bold text-white">
              Today&apos;s Tasks
              {!loading && (
                <span className="ml-2 text-sm font-normal text-gray-400">({tasks.length} projects active)</span>
              )}
            </h1>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-2">All clear!</p>
            <p className="text-sm">No active production projects with a current step set.</p>
          </div>
        ) : (
          <>
            {/* Section 1: Action Required */}
            {actionTasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <h2 className="font-semibold text-white text-sm">Action Required</h2>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{actionTasks.length}</span>
                </div>
                <div className="space-y-3">
                  {actionTasks.map(t => <TaskCard key={t.project.id} task={t} />)}
                </div>
              </div>
            )}

            {/* Section 2: Waiting On */}
            {waitingTasks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-orange-400" />
                  <h2 className="font-semibold text-white text-sm">Waiting On</h2>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{waitingTasks.length}</span>
                </div>
                {waitingSummary.length > 0 && (
                  <p className="text-xs text-gray-500 mb-3">
                    {waitingSummary.map(w => `${w.count} waiting on ${w.label}`).join(' · ')}
                  </p>
                )}
                <div className="space-y-3">
                  {waitingTasks.map(t => <TaskCard key={t.project.id} task={t} />)}
                </div>
              </div>
            )}

            {/* Section 3: Open Touch-Ups */}
            {touchups.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-yellow-400" />
                  <h2 className="font-semibold text-white text-sm">Open Touch-Ups</h2>
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{touchups.length}</span>
                </div>
                <div className="space-y-2">
                  {touchups.map(t => (
                    <div key={t.id} className={`bg-gray-900 border rounded-xl px-4 py-3 ${t.priority === 'urgent' ? 'border-red-700' : 'border-gray-800'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            {t.priority === 'urgent' && (
                              <span className="text-[10px] font-semibold bg-red-800 text-red-200 px-1.5 py-0.5 rounded uppercase">Urgent</span>
                            )}
                            <span className="text-sm font-semibold text-white leading-snug">{t.description}</span>
                          </div>
                          {t.assigned_to && <p className="text-xs text-gray-400">Assigned: {t.assigned_to}</p>}
                          {t.address && <p className="text-xs text-gray-500 mt-0.5">📍 {t.address}</p>}
                        </div>
                        <span className="text-xs text-gray-600 shrink-0">{formatAge((Date.now() - new Date(t.created_at).getTime()) / 3600000)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <Link href="/dashboard/touchups" className="text-xs text-amber-400 hover:text-amber-300">
                    Go to Touch-Ups →
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT: Calendar ── */}
      <div className="w-80 shrink-0 space-y-4">
        <h2 className="text-sm font-semibold text-gray-300">Calendar</h2>
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
        {/* Upcoming events list */}
        {events.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">This Month</h3>
            {events.map(ev => (
              <div key={ev.id} className="flex items-start gap-2 text-xs">
                <span className="text-gray-500 shrink-0 w-16">{ev.event_date.slice(5).replace('-', '/')}</span>
                <span className="text-gray-200 flex-1 truncate">{ev.title}</span>
              </div>
            ))}
          </div>
        )}
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
