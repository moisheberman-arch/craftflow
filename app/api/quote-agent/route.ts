import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AIMessage, PricingMaterial, PricingAddon, Quote } from '@/lib/core/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function formatMaterialsForPrompt(materials: PricingMaterial[]): string {
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
  const rem = inches % 12
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

// Per-type follow-up question hints for the initial AI message
const INITIAL_QUESTIONS: Record<string, string> = {
  bookcase: `For this bookcase project, ask about: exact ceiling height (if not provided), confirm number of units, whether the customer wants adjustable vs fixed shelving, hardware preferences (knobs/pulls style), whether finish should be painted or stained, and any crown or base molding.`,
  built_in: `For this built-in project, ask about: exact ceiling height (if not provided), confirm TV size and placement if TV recess is needed, whether there are columns or obstacles, any integrated lighting, drawer or door configuration, and painted vs stained finish.`,
  dining_table: `For this dining table project, ask about: confirm seating count (6, 8, 10?), whether the customer wants a pedestal or 4-leg base, wood grain direction preference (breadboard ends?), and finish type (oil, lacquer, or painted).`,
  buffet: `For this buffet project, ask about: confirm number of doors vs drawers, whether it needs a hutch top, stone/marble top vs wood, and hardware style preference.`,
  bar: `For this bar project, ask about: whether it's a wet bar with sink, countertop material (wood, stone, metal), whether there's a back bar or just the front, and any built-in refrigeration or bottle storage.`,
  desk: `For this desk project, ask about: whether there are hutch uppers, how many drawers, whether there's a keyboard tray, cable management needs, and painted vs stained finish.`,
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured. Add it to your environment variables.' },
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

  // Fetch pricing config, past quotes, and full project context in parallel
  const [materialsRes, addonsRes, pastQuotesRes, projectRes, typeAnswersRes, designNotesRes] = await Promise.all([
    supabase.from('pricing_materials').select('*').order('category'),
    supabase.from('pricing_addons').select('*').order('name'),
    supabase.from('quotes').select('*').eq('status', 'final').order('updated_at', { ascending: false }).limit(10),
    supabase.from('projects').select('*, customer:customers(*)').eq('id', projectId).single(),
    supabase.from('project_type_answers')
      .select('*, field:project_type_fields(field_label)')
      .eq('project_id', projectId),
    supabase.from('design_meeting_notes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
  ])

  const pricingMaterials: PricingMaterial[] = materialsRes.data ?? []
  const pricingAddons: PricingAddon[] = addonsRes.data ?? []
  const pastQuotes: Quote[] = pastQuotesRes.data ?? []
  const project = projectRes.data as Record<string, unknown> & {
    customer?: { name?: string }
    requested_addons?: string[]
  } | null

  // Resolve addon names
  let addonNames: string[] = []
  if (project?.requested_addons && Array.isArray(project.requested_addons) && project.requested_addons.length > 0) {
    const { data: addonRows } = await supabase
      .from('pricing_addons')
      .select('id, name')
      .in('id', project.requested_addons)
    addonNames = (addonRows ?? []).map((a: { name: string }) => a.name)
  }

  // Build project type answers list
  const typeAnswers: { label: string; answer: string }[] = []
  for (const row of (typeAnswersRes.data ?? [])) {
    const label = (row.field as { field_label?: string } | null)?.field_label
    if (label && row.answer) typeAnswers.push({ label, answer: row.answer })
  }

  // Build design notes list
  const designNotes = (designNotesRes.data ?? []).map((n: { created_at: string; notes: string }) => ({
    date: new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    notes: n.notes,
  }))

  // Resolve dimensions
  const widthIn = (project?.width_inches ?? projectDetails?.width_inches) as number | null | undefined
  const heightIn = (project?.height_inches ?? projectDetails?.height_inches) as number | null | undefined
  const depthIn = (project?.depth_inches ?? projectDetails?.depth_inches) as number | null | undefined
  const ceilIn = (project?.ceiling_height_inches ?? projectDetails?.ceiling_height_inches) as number | null | undefined

  const dimParts: string[] = []
  if (widthIn) dimParts.push(`${inchesToFeetInches(widthIn)} W (${widthIn}")`)
  if (heightIn) dimParts.push(`${inchesToFeetInches(heightIn)} H (${heightIn}")`)
  if (depthIn) dimParts.push(`${inchesToFeetInches(depthIn)} D (${depthIn}")`)

  const rawType = (project?.project_type ?? projectDetails?.project_type) as string | null | undefined
  const humanType = rawType ? humanizeProjectType(rawType) : 'Not specified'

  const projectDetailsSection = `PROJECT DETAILS:
- Customer: ${project?.customer?.name ?? projectDetails?.customer ?? 'Not specified'}
- Project Type: ${humanType}
- Primary Material: ${(project?.primary_material ?? projectDetails?.primary_material) ?? 'Not specified'}
- Dimensions: ${dimParts.length > 0 ? dimParts.join(' × ') : 'Not specified'}${ceilIn ? `\n- Ceiling Height: ${inchesToFeetInches(ceilIn)} (${ceilIn}")` : ''}
- Color / Finish: ${(project?.color_finish ?? projectDetails?.color_finish) ?? 'Not specified'}
- Requested Add-ons: ${addonNames.length > 0 ? addonNames.join(', ') : 'None'}
- Project Notes: ${(project?.notes ?? projectDetails?.notes) ?? 'None'}
${typeAnswers.length > 0 ? `\nPROJECT-SPECIFIC DETAILS (${humanType}):\n${typeAnswers.map(a => `- ${a.label}: ${a.answer}`).join('\n')}` : ''}
${designNotes.length > 0 ? `\nDESIGN MEETING NOTES:\n${designNotes.map(n => `[${n.date}] ${n.notes}`).join('\n\n')}` : ''}`

  // Build the initial-message instruction when this is the first call
  const initialMessageInstruction = isInitialLoad ? `
OPENING MESSAGE INSTRUCTIONS:
This is the first message of the quoting conversation. Do NOT attempt to price anything yet.
Your response must:
1. Start with a one-line greeting.
2. Then output a "What I have so far:" block that summarizes every captured project detail above in a clean, scannable format — one bullet per field. Use plain English, not JSON. If a field is "Not specified" or "None," include it so the sales person can see what's missing at a glance.
3. Then ask targeted follow-up questions to fill gaps needed for an accurate quote. Be specific to this project type. ${rawType && INITIAL_QUESTIONS[rawType] ? INITIAL_QUESTIONS[rawType] : 'Ask about any missing dimensions, finish preferences, and key design decisions.'}
4. End with exactly this sentence: "Once you confirm these details I'll generate a full quote with pricing breakdown."
Keep this message concise and structured — no pricing, no estimates yet.
` : ''

  const systemPrompt = `You are an expert estimator for a high-end custom furniture and millwork shop. You help the sales team build accurate, detailed quotes for custom projects including dining tables, built-in entertainment centers, bookcases, bars, study built-ins, desks, and buffets.

${initialMessageInstruction}
PRICING RULES:
- Base markup rule: raw material cost is approximately 30% of the final sell price (roughly 70% markup). This is a starting point, not a hard rule.
- Complexity adjustment: assess labor intensity separately from material cost. Highly intricate work (curves, custom inlay, complex millwork, arched openings, hand-carved details) warrants a higher markup. Simple linear scaling (longer table with no added complexity) does not increase markup proportionally.
- Your markup range is roughly 65% to 80% depending on complexity. Extremely intricate one-of-a-kind pieces may go higher.
- Always show your reasoning: state the material cost, explain your complexity assessment, then state the final price.

FURNITURE KNOWLEDGE (standard dimensions and rules of thumb):
- Bookcases: typically 28–34 inches wide. Calculate how many fit in a given wall span.
- Standard cabinet door height: approximately 24 inches for base cabinets, variable for uppers.
- Fluting runs the height of a door or panel — calculate linear footage from height.
- Crown molding runs the perimeter of the top of the unit — calculate from width and depth.
- Base molding runs the perimeter of the base — calculate from width and depth.
- Drawer slides come in pairs — count number of drawers and multiply.
- Hinges: 2 per door for standard doors, 3 per door for doors over 48 inches tall.
- Plywood sheets are 4x8 feet — estimate sheets needed based on surface area with 15% waste factor.
- Standard table leaf/extension width: 12–18 inches each.
- Dining table standard height: 30 inches. Standard depth: 38–42 inches.

${projectDetailsSection}

IMPORTANT: The project details above contain all captured information about this project. Reference these details directly in your responses. Do NOT ask for information that is already captured (e.g. don't ask for dimensions that are already listed above). Only ask for genuinely missing fields.

PRICING CONFIG — MATERIALS:
${formatMaterialsForPrompt(pricingMaterials)}

PRICING CONFIG — ADD-ONS & FEATURES:
${formatAddonsForPrompt(pricingAddons)}

PAST QUOTE EXAMPLES (last ${pastQuotes.length} finalized quotes — use as calibration):
${formatPastQuotesForPrompt(pastQuotes)}

BEHAVIOR RULES:
- Do not suggest add-ons the customer did not ask for.
- Always calculate quantities from dimensions before pricing. Show your math.
- When a feature has both a unit price and a typical flat rate in the config, note both but lean toward the flat rate if past quotes support it.
- Output format for a completed quote: first a SCOPE OF WORK paragraph (professional, suitable for an estimate document), then a COST BREAKDOWN section (itemized with line totals), then a COMPLEXITY ASSESSMENT paragraph, then the FINAL PRICE on its own line formatted as: FINAL PRICE: $X,XXX
- The quote is not final until the sales person explicitly says "mark this as final." Until then it is an initial or revised estimate.
- If dimensions are missing, ask for them before attempting to price.
- When the user says "mark this as final," confirm the final price and scope, then end your message with: STATUS: FINAL`

  // For the initial load, inject a hidden trigger message so the AI generates the opening
  const triggerMessage = isInitialLoad
    ? [{ role: 'user', content: '__OPEN__' }]
    : conversationHistory.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...triggerMessage,
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
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
