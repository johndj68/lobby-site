import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { processImage, validateImageInput, ImageProcessingError } from '@/lib/image-processing'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit-redis'

const MAX_INPUT_SIZE = 10 * 1024 * 1024
const BUCKET = 'project-images'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'technician') {
      return NextResponse.json({ error: 'Apenas técnicos podem fazer upload.' }, { status: 403 })
    }

    const ip = getClientIp(req)
    const rateLimitKey = `upload:admin-image:${user.id}`
    const ipLimitKey = `upload:admin-image:ip:${ip}`

    const userLimit = await checkRateLimit({ key: rateLimitKey, limit: 100, windowMs: 3_600_000 })
    if (!userLimit.allowed) {
      return NextResponse.json(
        { error: 'Limite de upload atingido. Tente novamente mais tarde.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((userLimit.resetAt - Date.now()) / 1000)) },
        },
      )
    }

    const ipLimit = await checkRateLimit({ key: ipLimitKey, limit: 300, windowMs: 3_600_000 })
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Limite de upload por IP excedido.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((ipLimit.resetAt - Date.now()) / 1000)) },
        },
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const slug = formData.get('slug') as string

    if (!file) {
      return NextResponse.json({ error: 'Arquivo não fornecido.' }, { status: 400 })
    }

    if (!slug) {
      return NextResponse.json({ error: 'Slug do projeto não fornecido.' }, { status: 400 })
    }

    if (file.size > MAX_INPUT_SIZE) {
      return NextResponse.json(
        { error: `Arquivo muito grande (máx. ${MAX_INPUT_SIZE / 1024 / 1024} MB).` },
        { status: 413 },
      )
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer())

    const validation = await validateImageInput(inputBuffer, file.type)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const processed = await processImage(inputBuffer, 'common')

    const ext = 'webp'
    const storagePath = `${slug}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, processed.buffer, {
        contentType: 'image/webp',
        cacheControl: '31536000',
      })

    if (uploadError) {
      return NextResponse.json({ error: 'Erro ao enviar para storage.' }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath)

    return NextResponse.json({
      url: publicUrl,
      path: storagePath,
      width: processed.width,
      height: processed.height,
      sizeFinal: processed.size,
      sizeOriginal: inputBuffer.length,
      quality: processed.quality,
      savings: Math.round((1 - processed.size / inputBuffer.length) * 100),
    })
  } catch (err) {
    if (err instanceof ImageProcessingError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }

    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
    }

    console.error('[upload/admin-image] Erro:', err)
    return NextResponse.json({ error: 'Erro ao processar upload.' }, { status: 500 })
  }
}
