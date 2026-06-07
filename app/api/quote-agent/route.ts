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
  }: {
    projectId: string
    conversationHistory: AIMessage[]
    projectDetails: Record<string, unknown>
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
  const project = projectRes.data

  // Fetch addon names for requested_addons IDs
  let addonNames: string[] = []
  if (project?.requested_addons && Array.isArray(project.requested_addons) && project.requested_addons.length > 0) {
    const { data: addonRows } = await supabase
      .from('pricing_addons')
      .select('id, name')
      .in('id', project.requested_addons)
    addonNames = (addonRows ?? []).map((a: { name: string }) => a.name)
  }

  // Build PROJECT DETAILS section
  const typeAnswers: { label: string; answer: string }[] = []
  for (const row of (typeAnswersRes.data ?? [])) {
    const label = (row.field as { field_label?: string } | null)?.field_label
    if (label && row.answer) {
      typeAnswers.push({ label, answer: row.answer })
    }
  }

  const designNotes = (designNotesRes.data ?? []).map((n: { created_at: string; notes: string }) => ({
    date: new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    notes: n.notes,
  }))

  const p = project ?? {}
  const customer = (p as Record<string, unknown> & { customer?: { name?: string } }).customer
  const dimensionParts: string[] = []
  if ((p as Record<string, unknown>).width_inches) dimensionParts.push(`${(p as Record<string, unknown>).width_inches}" W`)
  if ((p as Record<string, unknown>).height_inches) dimensionParts.push(`${(p as Record<string, unknown>).height_inches}" H`)
  if ((p as Record<string, unknown>).depth_inches) dimensionParts.push(`${(p as Record<string, unknown>).depth_inches}" D`)

  const projectDetailsSection = `
PROJECT DETAILS:
- Customer: ${customer?.name ?? projectDetails.customer ?? 'Unknown'}
- Project Type: ${(p as Record<string, unknown>).project_type ?? projectDetails.project_type ?? 'Unknown'}
- Primary Material: ${(p as Record<string, unknown>).primary_material ?? projectDetails.primary_material ?? 'Not specified'}
- Dimensions: ${dimensionParts.length > 0 ? dimensionParts.join(' × ') : 'Not specified'}${(p as Record<string, unknown>).ceiling_height_inches ? `\n- Ceiling Height: ${(p as Record<string, unknown>).ceiling_height_inches}"` : ''}
- Color / Finish: ${(p as Record<string, unknown>).color_finish ?? projectDetails.color_finish ?? 'Not specified'}
- Requested Add-ons: ${addonNames.length > 0 ? addonNames.join(', ') : 'None specified'}
- Notes: ${(p as Record<string, unknown>).notes ?? projectDetails.notes ?? 'None'}
${typeAnswers.length > 0 ? `\nPROJECT-SPECIFIC DETAILS (${(p as Record<string, unknown>).project_type ?? 'this type'}):\n${typeAnswers.map(a => `- ${a.label}: ${a.answer}`).join('\n')}` : ''}
${designNotes.length > 0 ? `\nDESIGN MEETING NOTES:\n${designNotes.map(n => `[${n.date}] ${n.notes}`).join('\n\n')}` : ''}`.trim()

  const systemPrompt = `You are an expert estimator for a high-end custom furniture and millwork shop. You help the sales team build accurate, detailed quotes for custom projects including dining tables, built-in entertainment centers, bookcases, bars, study built-ins, desks, and buffets.

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

IMPORTANT: The project details above contain all captured information about this project. Reference these details in your response. Do NOT ask for information that is already captured above (dimensions, material, finish, add-ons, design notes, etc.). If a field says "Not specified," you may ask for that specific piece of information.

PRICING CONFIG — MATERIALS:
${formatMaterialsForPrompt(pricingMaterials)}

PRICING CONFIG — ADD-ONS & FEATURES:
${formatAddonsForPrompt(pricingAddons)}

PAST QUOTE EXAMPLES (last ${pastQuotes.length} finalized quotes):
${formatPastQuotesForPrompt(pastQuotes)}

BEHAVIOR RULES:
- Do not suggest add-ons the customer did not ask for.
- Always calculate quantities from dimensions before pricing. Show your math.
- When a feature has both a unit price and a typical flat rate in the config, note both but lean toward the flat rate if past quotes support it.
- Output format for a completed quote: first a SCOPE OF WORK paragraph (professional, suitable for an estimate document), then a COST BREAKDOWN section (itemized with line totals), then a COMPLEXITY ASSESSMENT paragraph, then the FINAL PRICE on its own line formatted as: FINAL PRICE: $X,XXX
- The quote is not final until the sales person explicitly says "mark this as final." Until then it is an initial or revised estimate.
- If dimensions are missing, ask for them before attempting to price.
- When the user says "mark this as final," confirm the final price and scope, then end your message with: STATUS: FINAL`

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content })),
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
