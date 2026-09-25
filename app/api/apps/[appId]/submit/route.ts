import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { calculateReview } from '@/lib/validations/app-review'
import crypto from 'crypto'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { acceptances } = await req.json()

  if (!acceptances || typeof acceptances !== 'object') {
    return NextResponse.json({ error: 'Missing acceptances' }, { status: 400 })
  }

  // Validate required acceptances
  if (!acceptances.authorized_to_commercialize || !acceptances.reviewed_app_info ||
      !acceptances.accepted_partner_terms || !acceptances.accepted_commercial_terms) {
    return NextResponse.json({ error: 'All terms must be accepted' }, { status: 400 })
  }

  try {
    // Load draft
    const { data: draft } = await supabase
      .from('app_drafts')
      .select('*')
      .eq('id', appId)
      .eq('created_by', user.id)
      .single()

    if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Check if already submitted
    if (draft.status === 'submitted' || draft.status === 'under_review') {
      return NextResponse.json({ error: 'Already submitted' }, { status: 400 })
    }

    // Reload all data for validation
    const { data: plans } = await supabase
      .from('app_plans')
      .select('*')
      .eq('app_draft_id', appId)

    const { data: config } = await supabase
      .from('app_activation_config')
      .select('*')
      .eq('app_draft_id', appId)
      .single()

    const { data: members } = await supabase
      .from('app_team_members')
      .select('*')
      .eq('app_draft_id', appId)

    const { data: invitations } = await supabase
      .from('app_team_invitations')
      .select('*')
      .eq('app_draft_id', appId)
      .eq('status', 'pending')

    // Validate (server-side)
    const review = calculateReview(draft, plans || [], config, members || [], invitations || [])
    if (review.blockers > 0) {
      return NextResponse.json({ error: 'Validation failed - blockers present' }, { status: 400 })
    }

    // Create acceptance record
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] ||
                      req.headers.get('x-real-ip') ||
                      'unknown'

    const { data: acceptance, error: acceptError } = await supabase
      .from('app_review_acceptances')
      .insert({
        app_draft_id: appId,
        user_id: user.id,
        authorized_to_commercialize: acceptances.authorized_to_commercialize,
        reviewed_app_info: acceptances.reviewed_app_info,
        accepted_partner_terms: acceptances.accepted_partner_terms,
        accepted_commercial_terms: acceptances.accepted_commercial_terms,
        partner_terms_version: 'v1.0', // TODO: Get from config
        commercial_terms_version: 'v1.0',
        ip_address: ipAddress,
        user_agent: req.headers.get('user-agent') || 'unknown',
      })
      .select()
      .single()

    if (acceptError) {
      console.error('[submit] acceptance error:', acceptError)
      return NextResponse.json({ error: 'Failed to record acceptance' }, { status: 500 })
    }

    // Create submission
    const { data: submission, error: submitError } = await supabase
      .from('app_submissions')
      .insert({
        app_draft_id: appId,
        submitted_by: user.id,
        status: 'pending',
        acceptance_id: acceptance.id,
        data: {
          // Snapshot of current state
          name: draft.name,
          short_description: draft.short_description,
          full_description: draft.full_description,
          category: draft.category,
          category_id: draft.category_id,
          logo_url: draft.logo_url,
          media_gallery: draft.media_gallery,
          features: draft.features,
          plans: plans,
          activation_config: config,
          team_members: (members || []).length,
        },
        content_snapshot: draft, // Full draft snapshot
      })
      .select()
      .single()

    if (submitError) {
      console.error('[submit] submission error:', submitError)
      return NextResponse.json({ error: 'Failed to create submission' }, { status: 500 })
    }

    // Update draft status
    const { error: updateError } = await supabase
      .from('app_drafts')
      .update({
        status: 'submitted',
        stage: 4,
        last_edited_at: new Date().toISOString(),
      })
      .eq('id', appId)

    if (updateError) {
      console.error('[submit] update error:', updateError)
      // Submission was created but status update failed
      // This is OK - submission exists, just status might be inconsistent
      // Should be fixed by admin/retry
    }

    return NextResponse.json({
      submission: {
        id: submission.id,
        app_id: appId,
        status: submission.status,
        submitted_at: submission.submitted_at,
        acceptance_id: acceptance.id,
      },
    })
  } catch (err) {
    console.error('[submit]', err)
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 })
  }
}
