import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership via draft
  const { data: plan } = await supabase
    .from('app_plans')
    .select('app_draft_id')
    .eq('id', id)
    .single()

  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id')
    .eq('id', plan.app_draft_id)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const updates = await req.json()

  const { data, error } = await supabase
    .from('app_plans')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[plans PATCH]', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: plan } = await supabase
    .from('app_plans')
    .select('app_draft_id')
    .eq('id', id)
    .single()

  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: draft } = await supabase
    .from('app_drafts')
    .select('id')
    .eq('id', plan.app_draft_id)
    .eq('created_by', user.id)
    .single()

  if (!draft) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase
    .from('app_plans')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[plans DELETE]', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
