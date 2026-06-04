import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AIMessage, PricingMaterial, PricingAddon, Quote } from '@/lib/core/types'

// OPENAI_API_KEY must be set in .env.local and Vercel environment variables
// Get your key at https://platform.openai.com/api-keys

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

  // Fetch pricing config and past quotes in parallel
  const [materialsRes, addonsRes, pastQuotesRes] = await Promise.all([
    supabase.from('pricing_materials').select('*').order('category'),
    supabase.from('pricing_addons').select('*').order('name'),
    supabase.from('quotes').select('*').eq('status', 'final').order('updated_at', { ascending: false }).limit(10),
  ])

  const pricingMaterials: PricingMaterial[] = materialsRes.data ?? []
  const pricingAddons: PricingAddon[] = addonsRes.data ?? []
  const pastQuotes: Quote[] = pastQuotesRes.data ?? []

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

CURRENT PROJECT DETAILS:
${JSON.stringify(projectDetails, null, 2)}

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

  // Build messages for OpenAI — convert from our AIMessage format
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

  // Parse structured fields from AI response
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
