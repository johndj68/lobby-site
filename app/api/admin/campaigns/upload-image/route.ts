import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { processImage, validateImageInput, ImageProcessingError } from '@/lib/image-processing'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit-redis'

const MAX_INPUT_SIZE = 10 * 1024 * 1024
const BUCKET = 'project-images'

/** Upload de imagem de anúncio — mesma validação/processamento de
 *  app/api/upload/admin-image/route.ts (mime real, redimensiona, webp).
 *  Sem HTML/script possível: validateImageInput rejeita qualquer coisa que
 *  não seja um bitmap real (seção 8). */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'technician') return NextResponse.json({ error: 'Apenas técnicos podem fazer upload aqui.' }, { status: 403 })

    const ip = getClientIp(req)
    const userLimit = await checkRateLimit({ key: `upload:campaign-image:${user.id}`, limit: 100, windowMs: 3_600_000 })
    if (!userLimit.allowed) return NextResponse.json({ error: 'Limite de upload atingido. Tente novamente mais tarde.' }, { status: 429 })
    const ipLimit = await checkRateLimit({ key: `upload:campaign-image:ip:${ip}`, limit: 300, windowMs: 3_600_000 })
    if (!ipLimit.allowed) return NextResponse.json({ error: 'Limite de upload por IP excedido.' }, { status: 429 })

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Arquivo não fornecido.' }, { status: 400 })
    if (file.size > MAX_INPUT_SIZE) return NextResponse.json({ error: `Arquivo muito grande (máx. ${MAX_INPUT_SIZE / 1024 / 1024} MB).` }, { status: 413 })

    const inputBuffer = Buffer.from(await file.arrayBuffer())
    const validation = await validateImageInput(inputBuffer, file.type)
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 })

    const processed = await processImage(inputBuffer, 'common')
    const storagePath = `campaigns/${user.id}-${Date.now()}.webp`

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, processed.buffer, {
      contentType: 'image/webp', cacheControl: '31536000',
    })
    if (uploadError) return NextResponse.json({ error: 'Erro ao enviar para storage.' }, { status: 500 })

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
    return NextResponse.json({ url: publicUrl, width: processed.width, height: processed.height })
  } catch (err) {
    if (err instanceof ImageProcessingError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('[campaigns/upload-image]', err)
    return NextResponse.json({ error: 'Erro ao processar upload.' }, { status: 500 })
  }
}
