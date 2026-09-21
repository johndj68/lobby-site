import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id')
    .eq('id', appId)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Load activation config
  const { data: config, error } = await supabase
    .from('app_activation_config')
    .select('*')
    .eq('app_draft_id', appId)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('[activation GET]', error)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }

  return NextResponse.json(config || null)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id')
    .eq('id', appId)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates = await req.json()

  // Validate URLs
  if (updates.activation_link) {
    try {
      new URL(updates.activation_link)
      if (!updates.activation_link.startsWith('https://') && process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          { error: 'Activation link must use HTTPS' },
          { status: 400 }
        )
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid activation link URL' },
        { status: 400 }
      )
    }
  }

  // Validate email
  if (updates.support_email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(updates.support_email)) {
      return NextResponse.json(
        { error: 'Invalid support email' },
        { status: 400 }
      )
    }
  }

  // Try to update, insert if not exists
  const { data: existing } = await supabase
    .from('app_activation_config')
    .select('id')
    .eq('app_draft_id', appId)
    .single()

  let result
  if (existing) {
    result = await supabase
      .from('app_activation_config')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('app_draft_id', appId)
      .select()
      .single()
  } else {
    result = await supabase
      .from('app_activation_config')
      .insert({
        app_draft_id: appId,
        ...updates,
      })
      .select()
      .single()
  }

  if (result.error) {
    console.error('[activation PATCH]', result.error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  return NextResponse.json(result.data)
}
