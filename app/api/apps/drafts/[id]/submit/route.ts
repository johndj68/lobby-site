import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params: { id } }: { params: { id: string } }
) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get draft
  const { data: draft, error: draftError } = await supabase
    .from('app_drafts')
    .select('*')
    .eq('id', id)
    .eq('created_by', user.id)
    .single()

  if (draftError || !draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // Validate required fields
  const required = ['name', 'short_description', 'full_description', 'category', 'support_email']
  for (const field of required) {
    if (!draft[field as keyof typeof draft]) {
      return NextResponse.json(
        { error: `Campo obrigatório não preenchido: ${field}` },
        { status: 400 }
      )
    }
  }

  // Check if there are plans
  const { data: plans } = await supabase
    .from('app_plans')
    .select('id')
    .eq('app_draft_id', id)

  if (!plans || plans.length === 0) {
    return NextResponse.json(
      { error: 'Adicione pelo menos um plano' },
      { status: 400 }
    )
  }

  // Create submission
  const { data: submission, error: submitError } = await supabase
    .from('app_submissions')
    .insert({
      app_draft_id: id,
      submitted_by: user.id,
      data: draft,
      status: 'pending',
    })
    .select('id')
    .single()

  if (submitError) {
    console.error('[submit]', submitError)
    return NextResponse.json({ error: 'Submit failed' }, { status: 500 })
  }

  // Update draft status
  await supabase
    .from('app_drafts')
    .update({ status: 'submitted' })
    .eq('id', id)

  return NextResponse.json({ submission_id: submission.id })
}
