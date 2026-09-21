import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const appId = formData.get('appId') as string

    if (!file || !appId) {
      return NextResponse.json({ error: 'Missing file or appId' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const fileName = `${appId}/${Date.now()}-${file.name}`

    const { data, error } = await supabase.storage
      .from('app_media')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (error) {
      console.error('[upload]', error)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from('app_media')
      .getPublicUrl(fileName)

    return NextResponse.json({ url: publicUrl, path: fileName })
  } catch (err) {
    console.error('[upload error]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
