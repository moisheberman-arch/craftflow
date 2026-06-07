import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AIMessage, PricingMaterial, PricingAddon, Quote } from '@/lib/core/types'

// Server-side Supabase client (anon key — only used for publicly-readable pricing tables)
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

function formatPastQuotesForPrompt(quotes: Quote[]): string {
  if (quotes.length === 0) return 'No finalized quotes yet.'
  return quotes
    .map((q, i) => {
      const lines = [`Quote ${i + 1}:`]
      if (q.scope_of_work) lines.push(`Scope: ${q.scope_of_work.slice(0, 300)}`)
      if (q.total_price) lines.push(`Final Price: $${q.total_price}`)
      if (q.markup_percentage) lines.push(`Markup: ${q.markup_percentage}%`)
      if (q.complexity_assessment) lines.push(`Complexity: ${q.complexity_assessment.slice(0, 200)}`)
      return lines.join('\n')
    })
    .join('\n\n---\n\n')
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
    projectDetails,
    isInitialLoad,
  }: {
    projectId: string
    conversationHistory: AIMessage[]
    projectDetails: Record<string, unknown>
    isInitialLoad?: boolean
  } = body

  // ── Diagnostic logging ───────────────────────────────────────────────────
  console.log('[quote-agent] projectId:', projectId)
  console.log('[quote-agent] isInitialLoad:', isInitialLoad)
  console.log('[quote-agent] projectDetails received from frontend:', JSON.stringify(projectDetails, null, 2))

  // ── Fetch pricing data server-side (publicly readable tables) ────────────
  const [materialsRes, addonsRes, pastQuotesRes] = await Promise.all([
    supabase.from('pricing_materials').select('*').order('category'),
    supabase.from('pricing_addons').select('*').order('name'),
    supabase.from('quotes')
      .select('scope_of_work, total_price, markup_percentage, complexity_assessment, status')
      .eq('status', 'final')
      .order('updated_at', { ascending: false })
      .limit(10),
  ])

  console.log('[quote-agent] pricing_materials count:', materialsRes.data?.length ?? 0, 'error:', materialsRes.error?.message)
  console.log('[quote-agent] pricing_addons count:', addonsRes.data?.length ?? 0, 'error:', addonsRes.error?.message)
  console.log('[quote-agent] past quotes count:', pastQuotesRes.data?.length ?? 0, 'error:', pastQuotesRes.error?.message)

  const pricingMaterials: PricingMaterial[] = materialsRes.data ?? []
  const pricingAddons: PricingAddon[] = addonsRes.data ?? []
  const pastQuotes: Quote[] = (pastQuotesRes.data ?? []) as unknown as Quote[]

  // ── Build project details section from frontend-provided data ────────────
  // The frontend fetches project data with an authenticated Supabase session.
  // The server-side anon client cannot reliably read project data when RLS
  // requires authentication, so we trust the frontend payload entirely.

  const customer = projectDetails.customer as string | null | undefined
  const rawType = projectDetails.project_type as string | null | undefined
  const humanType = rawType ? humanizeProjectType(rawType) : 'Not specified'
  const primaryMaterial = projectDetails.primary_material as string | null | undefined
  const colorFinish = projectDetails.color_finish as string | null | undefined
  const projectNotes = projectDetails.notes as string | null | undefined
  const widthIn = projectDetails.width_inches as number | null | undefined
  const heightIn = projectDetails.height_inches as number | null | undefined
  const depthIn = projectDetails.depth_inches as number | null | undefined
  const ceilIn = projectDetails.ceiling_height_inches as number | null | undefined

  // Resolve requested add-on IDs → names using the already-fetched addons list
  const requestedAddonIds = projectDetails.requested_addons as string[] | null | undefined
  let addonNames: string[] = []
  if (requestedAddonIds && Array.isArray(requestedAddonIds) && requestedAddonIds.length > 0) {
    addonNames = requestedAddonIds
      .map(addonId => pricingAddons.find(a => a.id === addonId)?.name)
      .filter((n): n is string => !!n)
    // If addons list wasn't readable (RLS), fall back to fetching by ID
    if (addonNames.length === 0) {
      const { data: addonRows } = await supabase
        .from('pricing_addons').select('id, name').in('id', requestedAddonIds)
      addonNames = (addonRows ?? []).map((a: { name: string }) => a.name)
    }
  }

  const dimParts: string[] = []
  if (widthIn) dimParts.push(`${inchesToFeetInches(widthIn)} W (${widthIn}")`)
  if (heightIn) dimParts.push(`${inchesToFeetInches(heightIn)} H (${heightIn}")`)
  if (depthIn) dimParts.push(`${inchesToFeetInches(depthIn)} D (${depthIn}")`)

  // Project-type-specific answers (passed as { label: answer } map from frontend)
  const typeSpecific = projectDetails.project_specific_details as Record<string, string> | null | undefined
  const typeAnswerLines = typeSpecific && Object.keys(typeSpecific).length > 0
    ? Object.entries(typeSpecific).map(([label, answer]) => `- ${label}: ${answer}`)
    : []

  // Design meeting notes (passed as array of { date, notes } from frontend)
  type DesignNoteEntry = { date: string; notes: string }
  const designNoteEntries = projectDetails.design_notes as DesignNoteEntry[] | null | undefined
  const designNoteLines = designNoteEntries && designNoteEntries.length > 0
    ? designNoteEntries.map(n => {
        const dateLabel = n.date ? new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'unknown date'
        return `[${dateLabel}] ${n.notes}`
      })
    : []

  const projectDetailsSection = [
    'PROJECT DETAILS:',
    `- Customer: ${customer ?? 'Not specified'}`,
    `- Project Type: ${humanType}`,
    `- Primary Material: ${primaryMaterial ?? 'Not specified'}`,
    `- Dimensions: ${dimParts.length > 0 ? dimParts.join(' × ') : 'Not specified'}`,
    ceilIn ? `- Ceiling Height: ${inchesToFeetInches(ceilIn)} (${ceilIn}")` : '- Ceiling Height: Not specified',
    `- Color / Finish: ${colorFinish ?? 'Not specified'}`,
    `- Requested Add-ons: ${addonNames.length > 0 ? addonNames.join(', ') : 'None specified'}`,
    `- Project Notes: ${projectNotes ?? 'None'}`,
    ...(typeAnswerLines.length > 0 ? [``, `PROJECT-SPECIFIC DETAILS (${humanType}):`, ...typeAnswerLines] : []),
    ...(designNoteLines.length > 0 ? [``, `DESIGN MEETING NOTES:`, ...designNoteLines] : []),
  ].join('\n')

  console.log('[quote-agent] projectDetailsSection:\n', projectDetailsSection)

  // ── System prompt ────────────────────────────────────────────────────────
  const openingInstruction = isInitialLoad ? `
OPENING MESSAGE INSTRUCTIONS (follow these exactly for this first message):
This is the very first message of the quoting conversation. Do NOT attempt to price anything yet.
Your response must do all four of the following in order:
1. One greeting sentence that names the customer and project type.
2. A "What I have so far:" section — bullet list, one line per field from the PROJECT DETAILS section below. List every field even if the value is "Not specified."
3. Targeted follow-up questions only for fields that are "Not specified" or unclear. ${rawType && INITIAL_QUESTIONS[rawType] ? INITIAL_QUESTIONS[rawType] : 'Ask about missing dimensions, finish preferences, and key design decisions.'}
4. End with exactly: "Once you confirm these details I'll generate a full quote with pricing breakdown."
Be concise. No pricing or estimates in this first message.
` : ''

  const systemPrompt = `You are an expert estimator for a high-end custom furniture and millwork shop. You help the sales team build accurate, detailed quotes for custom projects including dining tables, built-in entertainment centers, bookcases, bars, study built-ins, desks, and buffets.
${openingInstruction}
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
${formatPastQuotesForPrompt(pastQuotes)}

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
    // Inject a hidden trigger so the AI generates the structured opening message
    chatMessages.push({ role: 'user', content: 'Please open this quoting session.' })
  } else {
    chatMessages.push(
      ...conversationHistory
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }))
    )
  }

  console.log('[quote-agent] SYSTEM PROMPT (full):\n', systemPrompt)
  console.log('[quote-agent] sending', chatMessages.length, 'messages to OpenAI')

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
    console.error('[quote-agent] OpenAI error:', err)
    return NextResponse.json({ error: `OpenAI error: ${err}` }, { status: 500 })
  }

  const data = await response.json()
  const aiText: string = data.choices?.[0]?.message?.content ?? ''

  console.log('[quote-agent] AI response length:', aiText.length, 'chars')

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
