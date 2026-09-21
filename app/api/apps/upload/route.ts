import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const draftId = formData.get('draftId') as string
    const type = formData.get('type') as string

    if (!file || !draftId || !type) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Verify ownership
    const { data: draft } = await supabase
      .from('app_drafts')
      .select('id')
      .eq('id', draftId)
      .eq('created_by', user.id)
      .single()

    if (!draft) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Validate file
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
    }

    // Upload to Storage
    const filename = `${draftId}/${type}-${Date.now()}-${file.name}`
    const { data, error: uploadError } = await supabase.storage
      .from('app_media')
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('[upload]', uploadError)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('app_media')
      .getPublicUrl(filename)

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('[upload error]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
