'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getShopTaskProjects, getCalendarEvents, addCalendarEvent, deleteCalendarEvent,
  getOpenTouchups, getUnresolvedQuestionsAllProjects, updateSubtask,
  type ShopTaskProject,
} from '@/lib/api/supabase-client'
import type { CalendarEvent, CalendarEventType, Touchup, OpenQuestion, Project } from '@/lib/core/types'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatAge(hours: number): string {
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function projectLabel(p: Project | undefined): string {
  if (!p) return 'Unknown Project'
  return `${p.customer?.name ?? 'Unknown'} — ${p.project_type?.replace(/_/g, ' ') ?? 'Project'}`
}

// Missing critical info — same logic as the shop dashboard card alerts
function getMissingInfo(t: ShopTaskProject): string[] {
  const p = t.project
  const stepOrder = t.currentStep.sequence_order ?? 0
  const stepName = t.currentStep.step_name
  const alerts: string[] = []
  if (['Ready for Paint / Stain', 'In Paint Shop', 'Quality Check'].includes(stepName) && !p.color_finish)
    alerts.push('Paint Color')
  if (stepOrder > 3 && (!p.width_inches || !p.height_inches || !p.depth_inches))
    alerts.push('Dimensions')
  if (stepOrder > 4 && !p.primary_material)
    alerts.push('Wood Species')
  return alerts
}

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: 'Half day' },
  { value: 480, label: 'Full day' },
]

function formatEventTime(t?: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

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
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => month === 1 ? onMonthChange(12, year - 1) : onMonthChange(month - 1, year)}
          className="text-gray-500 hover:text-gray-900 px-2 py-1 rounded">◀</button>
        <h3 className="text-sm font-semibold text-gray-900">{MONTH_NAMES[month - 1]} {year}</h3>
        <button onClick={() => month === 12 ? onMonthChange(1, year + 1) : onMonthChange(month + 1, year)}
          className="text-gray-500 hover:text-gray-900 px-2 py-1 rounded">▶</button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-500 py-1">{d}</div>
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
              className={`rounded-lg p-1 min-h-[44px] cursor-pointer transition-colors group ${isToday ? 'bg-blue-50 border border-blue-300' : 'hover:bg-blue-50'}`}
              onClick={() => onAddEvent(dateStr)}
            >
              <span className={`text-xs font-medium block text-center mb-0.5 ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{day}</span>
              {dayEvents.slice(0, 2).map(ev => (
                <div key={ev.id} className="relative group/ev">
                  <div className={`text-[9px] truncate px-1 py-0.5 rounded mb-0.5 ${
                    ev.event_type === 'appointment' ? 'bg-amber-100 text-amber-700' :
                    ev.event_type === 'reminder' ? 'bg-orange-100 text-orange-700' :
                    ev.event_type === 'milestone' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-gray-200 text-gray-700'
                  }`} title={[ev.title, ev.event_time ? formatEventTime(ev.event_time) : '', ev.duration_minutes ? `${ev.duration_minutes} min` : '', ev.notes ?? ''].filter(Boolean).join('\n')}>
                    {ev.title}{ev.event_time ? ` — ${formatEventTime(ev.event_time)}` : ''}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); onDeleteEvent(ev.id) }}
                    className="absolute -top-0.5 -right-0.5 hidden group-hover/ev:flex items-center justify-center w-3 h-3 bg-red-700 text-white rounded-full text-[8px] leading-none"
                  >×</button>
                </div>
              ))}
              {dayEvents.length > 2 && <div className="text-[9px] text-gray-500">+{dayEvents.length - 2}</div>}
              <div className="hidden group-hover:block text-[9px] text-gray-400 text-center mt-0.5">+ add</div>
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
  const [eventTime, setEventTime] = useState('')
  const [duration, setDuration] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      const ev = await addCalendarEvent({
        event_date: date, title: title.trim(), notes: notes || null,
        project_id: null, event_type: eventType,
        event_time: eventTime || null,
        duration_minutes: duration ? parseInt(duration) : null,
      })
      onSave(ev)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white shadow-sm border border-gray-200 rounded-xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Add Event — {date}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input required placeholder="Event title" value={title} onChange={e => setTitle(e.target.value)}
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <select value={eventType} onChange={e => setEventType(e.target.value as CalendarEventType)}
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none">
            <option value="appointment">Appointment</option>
            <option value="reminder">Reminder</option>
            <option value="milestone">Milestone</option>
            <option value="other">Other</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Time</label>
              <input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Duration</label>
              <select value={duration} onChange={e => setDuration(e.target.value)}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none">
                <option value="">—</option>
                {DURATION_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>
          <textarea placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none resize-none" />
          <div className="flex gap-3">
            <button type="submit" disabled={saving || !title.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm">
              {saving ? 'Saving...' : 'Add Event'}
            </button>
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ShopTasksPage() {
  const [tasks, setTasks] = useState<ShopTaskProject[]>([])
  const [touchups, setTouchups] = useState<Touchup[]>([])
  const [questions, setQuestions] = useState<OpenQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1)
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [addingEventDate, setAddingEventDate] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getShopTaskProjects().catch(() => [] as ShopTaskProject[]),
      getOpenTouchups().catch(() => [] as Touchup[]),
      getUnresolvedQuestionsAllProjects().catch(() => [] as OpenQuestion[]),
    ]).then(([t, tu, qs]) => {
      setTasks(t)
      setTouchups(tu)
      setQuestions(qs)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    getCalendarEvents(calMonth, calYear).then(setEvents).catch(console.error)
  }, [calMonth, calYear])

  async function handleCompleteSubtask(subtaskId: string, stepId: string) {
    setCompletingId(subtaskId)
    try {
      await updateSubtask(subtaskId, { completed: true })
      setTasks(prev => prev.map(t =>
        t.currentStep.id === stepId
          ? { ...t, subtasks: t.subtasks.filter(s => s.id !== subtaskId), openSubtasks: t.openSubtasks - 1 }
          : t
      ))
    } finally { setCompletingId(null) }
  }

  // ── Four actionable categories only ──────────────────────────────────────
  const subtaskItems = tasks.flatMap(t => t.subtasks.map(st => ({ t, st })))
  const missingInfoItems = tasks
    .map(t => ({ t, alerts: getMissingInfo(t) }))
    .filter(x => x.alerts.length > 0)
  const urgentTouchups = touchups.filter(t => t.priority === 'urgent')
  const totalItems =
    subtaskItems.length +
    questions.length +
    missingInfoItems.reduce((s, x) => s + x.alerts.length, 0) +
    urgentTouchups.length

  return (
    <div className="flex gap-6 items-start">

      {/* ── LEFT: Actionable Items ── */}
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/shop" className="text-gray-500 hover:text-gray-700 text-sm">← Shop</Link>
          <h1 className="text-xl font-bold text-gray-900">
            Today&apos;s Tasks
            {!loading && (
              <span className="ml-2 text-sm font-normal text-gray-500">({totalItems} open items)</span>
            )}
          </h1>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : totalItems === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-2">All clear!</p>
            <p className="text-sm">No open sub-tasks, questions, missing info, or urgent touch-ups.</p>
          </div>
        ) : (
          <>
            {/* Open Sub-Tasks */}
            {subtaskItems.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <h2 className="font-semibold text-gray-900 text-sm">Open Sub-Tasks</h2>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{subtaskItems.length}</span>
                </div>
                <div className="space-y-2">
                  {subtaskItems.map(({ t, st }) => (
                    <div key={st.id} className="bg-white shadow-sm border border-gray-200 rounded-xl px-4 py-3 flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={completingId === st.id}
                        onChange={() => handleCompleteSubtask(st.id, t.currentStep.id)}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 bg-gray-100 accent-emerald-500 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium text-gray-900 ${completingId === st.id ? 'opacity-50' : ''}`}>{st.description}</p>
                        <p className="text-xs text-gray-500 capitalize">{projectLabel(t.project)}</p>
                      </div>
                      <Link href={`/dashboard/projects/${t.project.id}?view=shop`}
                        className="text-xs text-gray-500 hover:text-blue-600 shrink-0">Go to Project →</Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unresolved Open Questions */}
            {questions.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-orange-400" />
                  <h2 className="font-semibold text-gray-900 text-sm">Open Questions</h2>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{questions.length}</span>
                </div>
                <div className="space-y-2">
                  {questions.map(q => (
                    <div key={q.id} className="bg-white shadow-sm border border-gray-200 rounded-xl px-4 py-3 flex items-start gap-3">
                      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase mt-0.5 ${q.directed_at === 'customer' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'}`}>
                        {q.directed_at}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900">{q.question}</p>
                        <p className="text-xs text-gray-500 capitalize">{projectLabel(q.project)}</p>
                      </div>
                      <Link href={`/dashboard/projects/${q.project_id}?view=shop`}
                        className="text-xs text-gray-500 hover:text-blue-600 shrink-0">Go to Project →</Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing Critical Info */}
            {missingInfoItems.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <h2 className="font-semibold text-gray-900 text-sm">Missing Info</h2>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {missingInfoItems.reduce((s, x) => s + x.alerts.length, 0)}
                  </span>
                </div>
                <div className="space-y-2">
                  {missingInfoItems.flatMap(({ t, alerts }) => alerts.map(label => (
                    <Link
                      key={`${t.project.id}-${label}`}
                      href={`/dashboard/projects/${t.project.id}?view=shop`}
                      className="block bg-red-50/20 border border-red-200/60 rounded-xl px-4 py-3 text-sm text-red-600 hover:bg-red-100/40 transition-colors"
                    >
                      ⚠ {t.project.customer?.name ?? 'Unknown'} — Missing: {label}
                    </Link>
                  )))}
                </div>
              </div>
            )}

            {/* Urgent Touch-Ups */}
            {urgentTouchups.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <h2 className="font-semibold text-gray-900 text-sm">Urgent Touch-Ups</h2>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{urgentTouchups.length}</span>
                </div>
                <div className="space-y-2">
                  {urgentTouchups.map(t => (
                    <div key={t.id} className="bg-white shadow-sm border border-red-200/60 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{t.description}</p>
                        <p className="text-xs text-gray-500">{t.assigned_to ? `→ ${t.assigned_to}` : 'Unassigned'}</p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {formatAge((Date.now() - new Date(t.created_at).getTime()) / 3600000)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT: Calendar + Open Touch-Ups — sticky ── */}
      <div className="w-80 shrink-0 sticky top-6 space-y-4 max-h-[calc(100vh-80px)] overflow-y-auto">

        {/* Calendar */}
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-800">Calendar</h2>
            <button onClick={() => setAddingEventDate(
              `${calYear}-${String(calMonth).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
            )} className="text-xs text-blue-600 hover:text-blue-500">+ Add Event</button>
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
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">This Month</p>
              {events.slice(0, 5).map(ev => (
                <div key={ev.id} className="flex items-start gap-2 text-xs">
                  <span className="text-gray-500 shrink-0 w-14">{ev.event_date.slice(5).replace('-', '/')}</span>
                  <span className="text-gray-800 flex-1 truncate">{ev.title}{ev.event_time ? ` — ${formatEventTime(ev.event_time)}` : ''}</span>
                </div>
              ))}
              {events.length > 5 && <p className="text-[10px] text-gray-400">+{events.length - 5} more</p>}
            </div>
          )}
        </div>

        {/* All Open Touch-Ups */}
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              Open Touch-Ups
              {urgentTouchups.length > 0 && (
                <span className="bg-red-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{urgentTouchups.length} urgent</span>
              )}
            </h2>
            <Link href="/dashboard/touchups" className="text-xs text-blue-600 hover:text-blue-500">See all →</Link>
          </div>

          {touchups.length === 0 ? (
            <p className="text-xs text-gray-400">No open touch-ups.</p>
          ) : (
            <div className="space-y-2">
              {touchups.map(t => (
                <div key={t.id} className={`rounded-lg px-3 py-2.5 border ${t.priority === 'urgent' ? 'border-red-200 bg-red-50/20' : 'border-gray-200 bg-gray-100/40'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {t.priority === 'urgent' && (
                          <span className="text-[9px] font-semibold bg-red-100 text-red-700 px-1 py-0.5 rounded uppercase shrink-0">Urgent</span>
                        )}
                        <p className="text-xs font-semibold text-gray-900 truncate">{t.description}</p>
                      </div>
                      {t.assigned_to && <p className="text-[10px] text-gray-500">→ {t.assigned_to}</p>}
                      {t.address && <p className="text-[10px] text-gray-400 truncate">📍 {t.address}</p>}
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {formatAge((Date.now() - new Date(t.created_at).getTime()) / 3600000)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
