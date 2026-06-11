import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Server-side client — public endpoint, scoped strictly to approval-by-token
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function isExpired(expiresAt: string | null): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() < Date.now()
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { data: approval } = await supabase
    .from('customer_approvals').select('*').eq('token', params.token).maybeSingle()
  if (!approval) {
    return NextResponse.json({ error: 'Approval not found.' }, { status: 404 })
  }

  let projectName: string | null = null
  if (approval.project_id) {
    const { data: project } = await supabase
      .from('projects')
      .select('project_type, customer:customers(name)')
      .eq('id', approval.project_id)
      .maybeSingle()
    if (project) {
      const customer = Array.isArray(project.customer) ? project.customer[0] : project.customer
      const type = project.project_type ? String(project.project_type).replace(/_/g, ' ') : 'project'
      projectName = `${customer?.name ?? 'your'} ${type}`
    }
  }

  return NextResponse.json({
    approval_type: approval.approval_type,
    file_url: approval.file_url,
    approved: approval.approved,
    approved_at: approval.approved_at,
    expired: !approval.approved && isExpired(approval.expires_at),
    project_name: projectName,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { data: approval } = await supabase
    .from('customer_approvals').select('*').eq('token', params.token).maybeSingle()
  if (!approval) {
    return NextResponse.json({ error: 'Approval not found.' }, { status: 404 })
  }
  if (approval.approved) {
    return NextResponse.json({ success: true, alreadyApproved: true })
  }
  if (isExpired(approval.expires_at)) {
    return NextResponse.json({ error: 'This approval link has expired.' }, { status: 410 })
  }

  const body = await req.json().catch(() => ({}))
  const customerNotes: string | null = typeof body.customer_notes === 'string' && body.customer_notes.trim()
    ? body.customer_notes.trim()
    : null

  const { error } = await supabase
    .from('customer_approvals')
    .update({ approved: true, approved_at: new Date().toISOString(), customer_notes: customerNotes })
    .eq('token', params.token)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auto-advance the matching "Waiting: Customer Approval on ..." step if it is current
  if (approval.project_id && (approval.approval_type === 'sketch' || approval.approval_type === 'rendering')) {
    const expectedStep = approval.approval_type === 'sketch'
      ? 'Waiting: Customer Approval on Sketch'
      : 'Waiting: Customer Approval on Rendering'
    const { data: currentStep } = await supabase
      .from('production_steps')
      .select('*')
      .eq('project_id', approval.project_id)
      .eq('is_current', true)
      .maybeSingle()

    if (currentStep && currentStep.step_name === expectedStep) {
      // Mark complete and advance to the next incomplete step
      await supabase.from('production_steps')
        .update({ completed: true, is_current: false })
        .eq('id', currentStep.id)
      const { data: steps } = await supabase
        .from('production_steps').select('*')
        .eq('project_id', approval.project_id)
        .order('sequence_order')
      const next = (steps ?? []).find(
        s => !s.completed && s.id !== currentStep.id && (s.sequence_order ?? 0) > (currentStep.sequence_order ?? 0)
      )
      if (next) {
        await supabase.from('production_steps').update({ is_current: true }).eq('id', next.id)
      }
    }
  }

  return NextResponse.json({ success: true })
}
