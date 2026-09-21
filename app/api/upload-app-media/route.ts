import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { v4 as uuid } from 'crypto'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Auth check
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const draftId = formData.get('draftId') as string
    const type = formData.get('type') as string // 'logo' | 'main' | 'gallery'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!draftId || !type) {
      return NextResponse.json({ error: 'Missing draftId or type' }, { status: 400 })
    }

    // Validações
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de arquivo não permitido. Use PNG, JPEG ou WebP.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Máximo 10MB.' },
        { status: 400 }
      )
    }

    // Check draft ownership
    const { data: draft, error: draftError } = await supabase
      .from('app_drafts')
      .select('id, organization_id')
      .eq('id', draftId)
      .single()

    if (draftError || !draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }

    // Check user org access
    const { data: userOrgs } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', user.id)

    const hasAccess = userOrgs?.some((org) => org.organization_id === draft.organization_id)

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Upload to Supabase Storage
    const fileExt = file.name.split('.').pop()?.toLowerCase()
    const fileName = `${uuid()}.${fileExt}`
    const storagePath = `app-media/${draftId}/${type}/${fileName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('app-uploads')
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: 'Erro ao fazer upload do arquivo' },
        { status: 500 }
      )
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from('app-uploads').getPublicUrl(storagePath)

    // Return success
    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: storagePath,
      fileName: file.name,
      type: type,
      uploadedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Erro ao processar upload' },
      { status: 500 }
    )
  }
}
