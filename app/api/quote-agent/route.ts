import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AIMessage, PricingMaterial, PricingAddon } from '@/lib/core/types'

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function formatMaterialsForPrompt(materials: PricingMaterial[]): string {
  if (materials.length === 0) return 'No pricing data loaded.'
  return materials
    .map(m => {
      const parts = [`- ${m.name} (${m.category})`]
      if (m.unit_price != null) parts.push(`$${m.unit_price} ${m.unit}`)
      if (m.typical_flat_rate != null) parts.push(`flat rate $${m.typical_flat_rate}`)
      if (m.notes) parts.push(`[${m.notes}]`)
      return parts.join(' | ')
    })
    .join('\n')
}

function formatAddonsForPrompt(addons: PricingAddon[]): string {
  if (addons.length === 0) return 'No add-ons loaded.'
  return addons
    .map(a => {
      const parts = [`- ${a.name}`]
      if (a.unit_price != null) parts.push(`$${a.unit_price} ${a.unit}`)
      if (a.typical_flat_rate != null) parts.push(`typical flat $${a.typical_flat_rate}`)
      if (a.notes) parts.push(`[${a.notes}]`)
      return parts.join(' | ')
    })
    .join('\n')
}

function inchesToFeetInches(inches: number): string {
  const ft = Math.floor(inches / 12)
  const rem = Math.round(inches % 12)
  if (ft === 0) return `${rem}"`
  if (rem === 0) return `${ft}'`
  return `${ft}' ${rem}"`
}

function humanizeProjectType(t: string): string {
  const map: Record<string, string> = {
    dining_table: 'Dining Table',
    built_in: 'Built-In',
    bookcase: 'Bookcase',
    buffet: 'Buffet',
    bar: 'Bar',
    desk: 'Desk',
    other: 'Other',
  }
  return map[t] ?? t.replace(/_/g, ' ')
}

// Per-type follow-up question hints for the initial AI opening message
const INITIAL_QUESTIONS: Record<string, string> = {
  bookcase: 'For this bookcase project, ask about: exact ceiling height (if not provided), confirm number of units, whether the customer wants adjustable vs fixed shelving, hardware preferences (knobs/pulls style), painted or stained finish, and any crown or base molding.',
  built_in: 'For this built-in project, ask about: exact ceiling height (if not provided), TV size and placement if a TV recess is needed, whether there are columns or obstacles, any integrated lighting, drawer vs door configuration, and painted vs stained finish.',
  dining_table: 'For this dining table project, ask about: seating count (6, 8, 10?), whether the customer wants a pedestal or 4-leg base, breadboard ends preference, and finish type (oil, lacquer, or painted).',
  buffet: 'For this buffet project, ask about: number of doors vs drawers, whether it needs a hutch top, stone/marble vs wood top, and hardware style preference.',
  bar: 'For this bar project, ask about: wet bar with sink or dry bar, countertop material (wood, stone, metal), whether there is a back bar, and any built-in refrigeration or bottle storage.',
  desk: 'For this desk project, ask about: hutch uppers or not, number of drawers, keyboard tray, cable management needs, and painted vs stained finish.',
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured.' },
      { status: 500 }
    )
  }

  const body = await req.json()
  const {
    projectId,
    conversationHistory,
  }: {
    projectId: string
    conversationHistory: AIMessage[]
  } = body

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
  }

  const history: AIMessage[] = Array.isArray(conversationHistory) ? conversationHistory : []
  const isInitialLoad = !history.some(m => m.role === 'user')

  // ── Fetch ALL project + pricing data server-side, in parallel ────────────
  const [projectRes, answersRes, notesRes, materialsRes, addonsRes, pastQuotesRes] = await Promise.all([
    supabase
      .from('projects')
      .select('*, customer:customers(*)')
      .eq('id', projectId)
      .maybeSingle(),
    supabase
      .from('project_type_answers')
      .select('answer, field:project_type_fields(field_label)')
      .eq('project_id', projectId),
    supabase
      .from('design_meeting_notes')
      .select('notes, created_at')
      .eq('project_id', projectId)
      .order('created_at'),
    supabase.from('pricing_materials').select('*').order('category'),
    supabase.from('pricing_addons').select('*').order('name'),
    supabase
      .from('quotes')
      .select('scope_of_work, total_price')
      .eq('status', 'final')
      .order('updated_at', { ascending: false })
      .limit(10),
  ])

  if (projectRes.error || !projectRes.data) {
    return NextResponse.json(
      { error: `Could not load project: ${projectRes.error?.message ?? 'not found'}` },
      { status: 500 }
    )
  }

  const project = projectRes.data
  const pricingMaterials: PricingMaterial[] = materialsRes.data ?? []
  const pricingAddons: PricingAddon[] = addonsRes.data ?? []
  const pastQuotes = pastQuotesRes.data ?? []

  // ── Resolve requested add-on names from the project's jsonb id array ─────
  const requestedAddonIds: string[] = Array.isArray(project.requested_addons)
    ? project.requested_addons
    : []
  let addonNames = requestedAddonIds
    .map(addonId => pricingAddons.find(a => a.id === addonId)?.name)
    .filter((n): n is string => !!n)
  if (addonNames.length === 0 && requestedAddonIds.length > 0) {
    const { data: addonRows } = await supabase
      .from('pricing_addons').select('id, name').in('id', requestedAddonIds)
    addonNames = (addonRows ?? []).map((a: { name: string }) => a.name)
  }

  // ── Build PROJECT DETAILS section ─────────────────────────────────────────
  const customerName: string | null = project.customer?.name ?? null
  const rawType: string | null = project.project_type ?? null
  const humanType = rawType ? humanizeProjectType(rawType) : 'Not specified'

  const dimParts: string[] = []
  if (project.width_inches) dimParts.push(`${inchesToFeetInches(project.width_inches)} W (${project.width_inches}")`)
  if (project.height_inches) dimParts.push(`${inchesToFeetInches(project.height_inches)} H (${project.height_inches}")`)
  if (project.depth_inches) dimParts.push(`${inchesToFeetInches(project.depth_inches)} D (${project.depth_inches}")`)

  type AnswerRow = { answer: string | null; field: { field_label: string } | { field_label: string }[] | null }
  const typeAnswerLines = ((answersRes.data ?? []) as AnswerRow[])
    .map(r => {
      const f = Array.isArray(r.field) ? r.field[0] : r.field
      return f && r.answer ? `- ${f.field_label}: ${r.answer}` : null
    })
    .filter((l): l is string => !!l)

  const designNoteLines = (notesRes.data ?? []).map((n: { notes: string; created_at: string }) => {
    const dateLabel = n.created_at
      ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'unknown date'
    return `[${dateLabel}] ${n.notes}`
  })

  const projectDetailsSection = [
    'PROJECT DETAILS:',
    `- Customer: ${customerName ?? 'Not specified'}`,
    `- Project Type: ${humanType}`,
    `- Status: ${project.status ?? 'Not specified'}`,
    `- Job Address: ${project.address ?? 'Not specified'}`,
    `- Primary Material: ${project.primary_material ?? 'Not specified'}`,
    `- Dimensions: ${dimParts.length > 0 ? dimParts.join(' × ') : 'Not specified'}`,
    project.ceiling_height_inches
      ? `- Ceiling Height: ${inchesToFeetInches(project.ceiling_height_inches)} (${project.ceiling_height_inches}")`
      : '- Ceiling Height: Not specified',
    `- Color / Finish: ${project.color_finish ?? 'Not specified'}`,
    `- Requested Add-ons: ${addonNames.length > 0 ? addonNames.join(', ') : 'None specified'}`,
    `- Project Notes: ${project.notes ?? 'None'}`,
    project.deposit_date ? `- Deposit Received: ${new Date(project.deposit_date).toLocaleDateString('en-US')}` : '- Deposit Received: Not yet',
    ...(typeAnswerLines.length > 0 ? ['', `PROJECT-SPECIFIC DETAILS (${humanType}):`, ...typeAnswerLines] : []),
    ...(designNoteLines.length > 0 ? ['', 'DESIGN MEETING NOTES:', ...designNoteLines] : []),
  ].join('\n')

  const pastQuotesSection = pastQuotes.length === 0
    ? 'No finalized quotes yet.'
    : pastQuotes
        .map((q, i) => {
          const lines = [`Quote ${i + 1}:`]
          if (q.scope_of_work) lines.push(`Scope: ${q.scope_of_work.slice(0, 300)}`)
          if (q.total_price) lines.push(`Final Price: $${q.total_price}`)
          return lines.join('\n')
        })
        .join('\n\n---\n\n')

  // ── System prompt ────────────────────────────────────────────────────────
  const systemPrompt = `You are an expert estimator for a high-end custom furniture and millwork shop. You help the sales team build accurate, detailed quotes for custom projects including dining tables, built-in entertainment centers, bookcases, bars, study built-ins, desks, and buffets.

PRICING RULES:
- Base markup rule: raw material cost is approximately 30% of the final sell price (roughly 70% markup). This is a starting point, not a hard rule.
- Complexity adjustment: assess labor intensity separately from material cost. Highly intricate work (curves, custom inlay, complex millwork, arched openings, hand-carved details) warrants a higher markup. Simple linear scaling does not increase markup proportionally.
- Your markup range is roughly 65% to 80% depending on complexity. Extremely intricate pieces may go higher.
- Always show your reasoning: state the material cost, explain your complexity assessment, then state the final price.

FURNITURE KNOWLEDGE:
- Bookcases: typically 28–34 inches wide. Calculate how many fit in a given wall span.
- Crown molding runs the perimeter of the top of the unit. Base molding runs the perimeter of the base.
- Drawer slides come in pairs. Hinges: 2 per door, 3 for doors over 48" tall.
- Plywood sheets are 4x8 feet — estimate sheets from surface area with 15% waste.
- Standard dining table height: 30". Standard depth: 38–42".
- Standard table leaf/extension width: 12–18 inches each.

${projectDetailsSection}

IMPORTANT: The PROJECT DETAILS above are authoritative. Do NOT ask for information that is already listed above with a real value. Only ask for fields that say "Not specified" or "None."

PRICING CONFIG — MATERIALS:
${formatMaterialsForPrompt(pricingMaterials)}

PRICING CONFIG — ADD-ONS & FEATURES:
${formatAddonsForPrompt(pricingAddons)}

PAST QUOTE EXAMPLES (use as pricing calibration):
${pastQuotesSection}

BEHAVIOR RULES:
- Do not suggest add-ons the customer did not ask for.
- Always calculate quantities from dimensions before pricing. Show your math.
- Output format for a completed quote: SCOPE OF WORK paragraph, then COST BREAKDOWN (itemized), then COMPLEXITY ASSESSMENT paragraph, then: FINAL PRICE: $X,XXX
- The quote is not final until the sales person says "mark this as final." Until then it is initial or revised.
- When the user says "mark this as final," confirm and end with: STATUS: FINAL`

  // ── Build messages for OpenAI ────────────────────────────────────────────
  const chatMessages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ]

  if (isInitialLoad) {
    chatMessages.push({
      role: 'user',
      content: `This is the first message. Start by summarizing everything you know about this project from the PROJECT DETAILS section, then ask targeted follow-up questions for anything still needed to generate an accurate quote. Do not say 'tell me about the job' — you already have the details. ${rawType && INITIAL_QUESTIONS[rawType] ? INITIAL_QUESTIONS[rawType] : ''} Do not price anything yet.`,
    })
  } else {
    chatMessages.push(
      ...history
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }))
    )
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: chatMessages,
      temperature: 0.3,
      max_tokens: 2000,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return NextResponse.json({ error: `OpenAI error: ${err}` }, { status: 500 })
  }

  const data = await response.json()
  const aiText: string = data.choices?.[0]?.message?.content ?? ''

  const scopeMatch = aiText.match(/SCOPE OF WORK[:\s]*\n?([\s\S]*?)(?=\nCOST BREAKDOWN|\nCOMPLEXITY|\nFINAL PRICE|$)/i)
  const complexityMatch = aiText.match(/COMPLEXITY ASSESSMENT[:\s]*\n?([\s\S]*?)(?=\nFINAL PRICE|$)/i)
  const finalPriceMatch = aiText.match(/FINAL PRICE:\s*\$?([\d,]+)/i)
  const isMarkFinal = aiText.includes('STATUS: FINAL')

  return NextResponse.json({
    message: aiText,
    parsed: {
      scope_of_work: scopeMatch?.[1]?.trim() ?? null,
      complexity_assessment: complexityMatch?.[1]?.trim() ?? null,
      final_price: finalPriceMatch ? parseFloat(finalPriceMatch[1].replace(/,/g, '')) : null,
      is_final: isMarkFinal,
    },
  })
}
