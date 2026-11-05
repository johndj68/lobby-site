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

    // Defesa em profundidade: a RLS de storage.objects (bucket app_media,
    // migration 20260921000001) já bloqueia upload fora da própria pasta
    // (appId precisa ser um app_drafts.id de que o usuário é created_by) —
    // então isto nunca foi explorável. Mas essa rota era a única entre as
    // duas de upload de mídia sem checar isso em nível de app (a irmã,
    // app/api/apps/upload, sempre checou) — mesma checagem aqui, pra não
    // depender só da RLS como única trava.
    const { data: draft } = await supabase
      .from('app_drafts')
      .select('id')
      .eq('id', appId)
      .eq('created_by', user.id)
      .single()
    if (!draft) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Mesmo whitelist e limite de tamanho da rota irmã (app/api/apps/
    // upload) — o bucket já aplica allowed_mime_types/file_size_limit do
    // lado do Supabase Storage independente disto, mas validar aqui dá um
    // erro claro antes de gastar uma chamada de rede, e não depende de só
    // confiar na configuração do bucket.
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
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
