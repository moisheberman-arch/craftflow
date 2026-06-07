'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getProjectById,
  getQuoteByProjectId,
  createQuote,
  updateQuote,
  getMaterialsByProjectId,
  getStepsByProjectId,
  addMaterial,
  addStep,
  getStepLibrary,
  getFieldsByProjectType,
  getAnswersByProjectId,
  getNotesByProjectId,
} from '@/lib/api/supabase-client'
import type { Project, Quote, AIMessage, QuoteStatus, ProjectTypeField, ProjectTypeAnswer, DesignMeetingNote } from '@/lib/core/types'

const DEFAULT_STEPS = [
  { name: 'Shop drawings / rendering approved', category: 'design' as const },
  { name: 'Materials sourced and received', category: 'sourcing' as const },
  { name: 'Wood milling and prep', category: 'fabrication' as const },
  { name: 'Carcass / frame construction', category: 'fabrication' as const },
  { name: 'Door and drawer fitting', category: 'fabrication' as const },
  { name: 'Finish color confirmed with customer', category: 'finishing' as const },
  { name: 'Paint / stain applied — coat 1', category: 'finishing' as const },
  { name: 'Paint / stain applied — coat 2', category: 'finishing' as const },
  { name: 'Hardware installed', category: 'assembly' as const },
  { name: 'Quality check', category: 'assembly' as const },
  { name: 'Delivery scheduled', category: 'delivery' as const },
  { name: 'Delivery and installation complete', category: 'delivery' as const },
]

function parseBreakdownLines(text: string): { item: string; amount: string }[] {
  const section = text.match(/COST BREAKDOWN[:\s]*\n?([\s\S]*?)(?=\nCOMPLEXITY|\nFINAL PRICE|$)/i)
  if (!section) return []
  return section[1]
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && (l.includes('$') || l.startsWith('-')))
    .map(l => {
      const priceMatch = l.match(/\$[\d,]+/)
      return { item: l.replace(/\$[\d,]+.*$/, '').replace(/^[-•*]\s*/, '').trim(), amount: priceMatch?.[0] ?? '' }
    })
    .filter(l => l.item)
}

export default function QuoteAgentPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const [project, setProject] = useState<Project | null>(null)
  const [typeAnswerContext, setTypeAnswerContext] = useState<Record<string, string>>({})
  const [designNotes, setDesignNotes] = useState<DesignMeetingNote[]>([])
  const [quote, setQuote] = useState<Quote | null>(null)
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  // Right panel state — updated from AI responses
  const [scopeOfWork, setScopeOfWork] = useState('')
  const [complexity, setComplexity] = useState('')
  const [finalPrice, setFinalPrice] = useState<number | null>(null)
  const [breakdown, setBreakdown] = useState<{ item: string; amount: string }[]>([])
  const [savingStatus, setSavingStatus] = useState<QuoteStatus | null>(null)
  const [statusSaved, setStatusSaved] = useState(false)

  // Fix 4: Voice input state
  const [isListening, setIsListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    // Check Web Speech API support
    const SpeechRecognition =
      (typeof window !== 'undefined' &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) || null
    setSpeechSupported(!!SpeechRecognition)
  }, [])

  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setInput(prev => prev ? prev + ' ' + transcript : transcript)
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  useEffect(() => {
    async function load() {
      const [p, q] = await Promise.all([getProjectById(id), getQuoteByProjectId(id)])
      if (p?.project_type) {
        const [fields, answers, notes] = await Promise.all([
          getFieldsByProjectType(p.project_type).catch(() => [] as ProjectTypeField[]),
          getAnswersByProjectId(p.id).catch(() => [] as ProjectTypeAnswer[]),
          getNotesByProjectId(p.id).catch(() => [] as DesignMeetingNote[]),
        ])
        const ctx: Record<string, string> = {}
        for (const a of answers) {
          const field = fields.find(f => f.id === a.field_id)
          if (field && a.answer) ctx[field.field_label] = a.answer
        }
        setTypeAnswerContext(ctx)
        setDesignNotes(notes)
      }
      setProject(p)

      if (q) {
        setQuote(q)
        const hist = q.ai_conversation_history ?? []
        setMessages(hist)
        if (q.scope_of_work) setScopeOfWork(q.scope_of_work)
        if (q.complexity_assessment) setComplexity(q.complexity_assessment)
        if (q.total_price) setFinalPrice(q.total_price)
        // Parse last assistant message for breakdown
        const lastAssistant = [...hist].reverse().find(m => m.role === 'assistant')
        if (lastAssistant) setBreakdown(parseBreakdownLines(lastAssistant.content))
      } else {
        // Open with a greeting from the AI
        const greeting: AIMessage = {
          role: 'assistant',
          content: "I'm ready to help you build a quote for this project. I can see the project details. Tell me about the job — dimensions, materials, and any special features — and I'll work through the pricing.",
          timestamp: new Date().toISOString(),
        }
        setMessages([greeting])
      }
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function ensureQuote(): Promise<Quote> {
    if (quote) return quote
    const newQuote = await createQuote({
      project_id: id,
      ai_conversation_history: [],
      base_price: null,
      add_ons: [],
      total_price: null,
      markup_percentage: null,
      status: 'initial',
      scope_of_work: null,
      complexity_assessment: null,
      version: 1,
    })
    setQuote(newQuote)
    return newQuote
  }

  async function sendMessage() {
    if (!input.trim() || sending) return
    const userMsg: AIMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/quote-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          conversationHistory: updatedMessages,
          projectDetails: {
            customer: project?.customer?.name,
            project_type: project?.project_type,
            status: project?.status,
            address: project?.address,
            notes: project?.notes,
            primary_material: project?.primary_material,
            width_inches: project?.width_inches,
            height_inches: project?.height_inches,
            depth_inches: project?.depth_inches,
            ceiling_height_inches: project?.ceiling_height_inches,
            color_finish: project?.color_finish,
            requested_addons: project?.requested_addons,
            project_specific_details: Object.keys(typeAnswerContext).length > 0 ? typeAnswerContext : undefined,
            design_notes: designNotes.length > 0 ? designNotes.map(n => ({
              date: n.created_at,
              notes: n.notes,
            })) : undefined,
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'AI request failed')

      const aiMsg: AIMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
      }
      const finalMessages = [...updatedMessages, aiMsg]
      setMessages(finalMessages)

      // Update right panel
      if (data.parsed.scope_of_work) setScopeOfWork(data.parsed.scope_of_work)
      if (data.parsed.complexity_assessment) setComplexity(data.parsed.complexity_assessment)
      if (data.parsed.final_price) setFinalPrice(data.parsed.final_price)
      const newBreakdown = parseBreakdownLines(data.message)
      if (newBreakdown.length > 0) setBreakdown(newBreakdown)

      // Persist to Supabase
      const q = await ensureQuote()
      const updates: Partial<Quote> = {
        ai_conversation_history: finalMessages,
      }
      if (data.parsed.scope_of_work) updates.scope_of_work = data.parsed.scope_of_work
      if (data.parsed.complexity_assessment) updates.complexity_assessment = data.parsed.complexity_assessment
      if (data.parsed.final_price) updates.total_price = data.parsed.final_price
      if (data.parsed.is_final) updates.status = 'final'

      const updated = await updateQuote(q.id, updates)
      setQuote(updated)

      // Auto-populate materials and steps when marked final
      if (data.parsed.is_final) {
        await autoPopulateOnFinal(id, data.message, updated)
      }
    } catch (err) {
      const errorMsg: AIMessage = {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setSending(false)
    }
  }

  async function autoPopulateOnFinal(projectId: string, aiText: string, _q: Quote) {
    // Add default production steps if none exist
    const existingSteps = await getStepsByProjectId(projectId)
    if (existingSteps.length === 0) {
      const library = await getStepLibrary()
      for (let i = 0; i < DEFAULT_STEPS.length; i++) {
        const def = DEFAULT_STEPS[i]
        const libItem = library.find(l => l.step_name === def.name)
        await addStep({
          project_id: projectId,
          step_name: libItem?.step_name ?? def.name,
          description: libItem?.description ?? null,
          sequence_order: i + 1,
          completed: false,
          assigned_to: null,
          notes: null,
          step_type: (libItem?.step_type ?? 'action') as 'action' | 'waiting',
          waiting_on: (libItem?.waiting_on ?? null) as import('@/lib/core/types').WaitingOn | null,
          is_current: i === 0,
          is_optional: libItem?.is_optional ?? false,
        })
      }
    }

    // Parse COST BREAKDOWN and add matching materials to checklist
    const existingMaterials = await getMaterialsByProjectId(projectId)
    const breakdownLines = parseBreakdownLines(aiText)
    const { data: pricingMats } = await (await import('@/lib/supabase')).supabase
      .from('pricing_materials')
      .select('name, unit_price, typical_flat_rate')

    for (const line of breakdownLines) {
      if (!line.item || !line.amount) continue
      const alreadyExists = existingMaterials.some(
        m => m.item_name.toLowerCase().includes(line.item.toLowerCase().slice(0, 10))
      )
      if (alreadyExists) continue
      // Fuzzy match against pricing_materials
      const match = pricingMats?.find(
        (pm: { name: string }) => pm.name.toLowerCase().includes(line.item.toLowerCase().slice(0, 8)) ||
          line.item.toLowerCase().includes(pm.name.toLowerCase().slice(0, 8))
      )
      const costStr = line.amount.replace(/[$,]/g, '')
      const cost = costStr ? parseFloat(costStr) : (match?.unit_price ?? match?.typical_flat_rate ?? null)
      await addMaterial({
        project_id: projectId,
        item_name: line.item,
        cost_estimate: cost,
        ordered: false,
        received: false,
        notes: null,
      })
    }
  }

  async function saveQuoteStatus(status: QuoteStatus) {
    const q = await ensureQuote()
    setSavingStatus(status)
    try {
      const updates: Partial<Quote> = { status }
      if (status === 'revised') updates.version = (q.version ?? 1) + 1
      if (scopeOfWork) updates.scope_of_work = scopeOfWork
      if (complexity) updates.complexity_assessment = complexity
      if (finalPrice) updates.total_price = finalPrice
      const updated = await updateQuote(q.id, updates)
      setQuote(updated)
      setStatusSaved(true)
      setTimeout(() => setStatusSaved(false), 2000)
      if (status === 'final') {
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
        if (lastAssistant) await autoPopulateOnFinal(id, lastAssistant.content, updated)
      }
    } finally {
      setSavingStatus(null)
    }
  }

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/projects/${id}`} className="text-gray-400 hover:text-white text-sm">
            ← Back to Project
          </Link>
          <span className="text-gray-600">|</span>
          <h1 className="text-lg font-semibold">
            AI Quote Agent
            {project?.customer?.name && (
              <span className="text-gray-400 font-normal ml-2">— {project.customer.name}</span>
            )}
          </h1>
          {quote?.status && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              quote.status === 'final' ? 'bg-emerald-900 text-emerald-200' :
              quote.status === 'revised' ? 'bg-blue-900 text-blue-200' :
              'bg-gray-700 text-gray-300'
            }`}>
              {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
              {(quote.version ?? 1) > 1 && ` v${quote.version}`}
            </span>
          )}
        </div>
      </div>

      {/* Split layout */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Chat */}
        <div className="flex flex-col flex-1 min-w-0 bg-gray-900 rounded-xl border border-gray-800">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-amber-500 text-gray-950'
                    : 'bg-gray-800 text-gray-100'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-gray-800 rounded-xl px-4 py-3 text-sm text-gray-400">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                disabled={sending}
                placeholder="Describe the project — dimensions, materials, special features..."
                rows={3}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
              />
              <div className="flex flex-col gap-2 self-end">
                {/* Fix 4: Mic button — hidden if Web Speech API not supported */}
                {speechSupported && (
                  <button
                    type="button"
                    onClick={isListening ? stopListening : startListening}
                    title={isListening ? 'Stop recording' : 'Start voice input'}
                    className={`w-10 h-10 flex items-center justify-center rounded-lg text-lg transition-all ${
                      isListening
                        ? 'bg-red-600 hover:bg-red-500 animate-pulse text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    🎙️
                  </button>
                )}
                <button
                  onClick={sendMessage}
                  disabled={sending || !input.trim()}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm"
                >
                  Send
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              Enter to send · Shift+Enter for newline
              {speechSupported && <span> · 🎙️ Voice input works best in Chrome</span>}
            </p>
          </div>
        </div>

        {/* Right: Quote Summary */}
        <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">
          {/* Price */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">Final Price</p>
            <p className="text-3xl font-bold text-amber-400">
              {finalPrice != null ? `$${finalPrice.toLocaleString()}` : '—'}
            </p>
          </div>

          {/* Scope */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex-1">
            <p className="text-xs text-gray-400 mb-2">Scope of Work</p>
            <textarea
              value={scopeOfWork}
              onChange={e => setScopeOfWork(e.target.value)}
              rows={5}
              placeholder="Scope will appear here when the AI generates it..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-xs text-white resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Cost Breakdown */}
          {breakdown.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-2">Cost Breakdown</p>
              <div className="space-y-1">
                {breakdown.map((b, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-300 truncate mr-2">{b.item}</span>
                    <span className="text-amber-400 shrink-0 font-mono">{b.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Complexity */}
          {complexity && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-2">Complexity Assessment</p>
              <p className="text-xs text-gray-300 leading-relaxed">{complexity.slice(0, 300)}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
            <p className="text-xs text-gray-400 mb-2">Save Quote As</p>
            <button
              onClick={() => saveQuoteStatus('initial')}
              disabled={!!savingStatus}
              className="w-full text-sm py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {savingStatus === 'initial' ? 'Saving...' : 'Save as Initial'}
            </button>
            <button
              onClick={() => saveQuoteStatus('revised')}
              disabled={!!savingStatus}
              className="w-full text-sm py-2 rounded-lg border border-blue-700 text-blue-300 hover:bg-blue-950 disabled:opacity-50 transition-colors"
            >
              {savingStatus === 'revised' ? 'Saving...' : 'Save as Revised'}
            </button>
            <button
              onClick={() => saveQuoteStatus('final')}
              disabled={!!savingStatus || quote?.status === 'final'}
              className="w-full text-sm py-2 rounded-lg bg-emerald-800 text-emerald-200 hover:bg-emerald-700 disabled:opacity-50 transition-colors font-semibold"
            >
              {savingStatus === 'final' ? 'Saving...' : quote?.status === 'final' ? '✓ Marked Final' : 'Mark as Final'}
            </button>
            {statusSaved && (
              <p className="text-xs text-emerald-400 text-center">Saved!</p>
            )}
            {quote?.status === 'final' && (
              <p className="text-xs text-emerald-400 text-center mt-1">
                Materials checklist and production steps auto-populated.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
