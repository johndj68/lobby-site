import { createClient } from '@/lib/supabase'

const BUCKET = 'project-visuals'

const MAX_MB: Record<'image' | 'document', number> = { image: 10, document: 20 }
const ACCEPTED_TYPES: Record<'image' | 'document', RegExp> = {
  image: /^image\/(png|jpe?g|webp|gif|svg\+xml)$/i,
  document: /\.(pdf|docx?|xlsx?|pptx?|zip)$/i,
}

export class VisualUploadError extends Error {}

function safeFileName(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()
}

function validateFile(file: File, kind: 'image' | 'document') {
  const maxBytes = MAX_MB[kind] * 1024 * 1024
  if (file.size > maxBytes) {
    throw new VisualUploadError(`Arquivo muito grande (máx ${MAX_MB[kind]} MB).`)
  }
  const accepted = kind === 'image' ? ACCEPTED_TYPES.image.test(file.type) : ACCEPTED_TYPES.document.test(file.name)
  if (!accepted) {
    throw new VisualUploadError(kind === 'image'
      ? 'Tipo de arquivo não aceito. Use PNG, JPG, WEBP, GIF ou SVG.'
      : 'Tipo de arquivo não aceito. Use PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX ou ZIP.')
  }
}

export interface UploadImageResponse {
  url: string
  path: string
  width: number
  height: number
  sizeFinal: number
  sizeOriginal: number
  quality: number
  savings: number
}

export async function uploadProjectImage(
  file: File,
  kind: 'common' | 'avatar' | 'document' = 'common',
): Promise<UploadImageResponse> {
  if (file.size > 10 * 1024 * 1024) {
    throw new VisualUploadError('Arquivo muito grande (máx. 10 MB).')
  }

  if (!ACCEPTED_TYPES.image.test(file.type)) {
    throw new VisualUploadError('Tipo de arquivo não aceito. Use PNG, JPG ou WebP.')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('kind', kind)

  const response = await fetch('/api/upload/image', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new VisualUploadError(error.error || 'Erro ao enviar imagem.')
  }

  return response.json()
}

export async function uploadProjectVisual(file: File, kind: 'image' | 'document'): Promise<string> {
  if (kind === 'image') {
    try {
      const result = await uploadProjectImage(file, 'common')
      return result.url
    } catch (err) {
      if (err instanceof VisualUploadError) throw err
      throw new VisualUploadError('Erro ao fazer upload de imagem.')
    }
  }

  validateFile(file, kind)
  const supabase = createClient()
  const path = `${Date.now()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, cacheControl: '3600' })
  if (error) throw new VisualUploadError(error.message)
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

const PUBLIC_URL_MARKER = `/object/public/${BUCKET}/`

function extractStoragePath(storedUrl: string): string | null {
  const idx = storedUrl.indexOf(PUBLIC_URL_MARKER)
  if (idx === -1) return null
  return decodeURIComponent(storedUrl.slice(idx + PUBLIC_URL_MARKER.length))
}

/**
 * O bucket é privado — `storedUrl` (o valor salvo em VisualImage.url /
 * VisualDocument.fileUrl / Deliverable.imageUrl) não é mais acessível
 * diretamente. Troca por uma signed URL de curta duração, sujeita à RLS
 * de storage.objects (só resolve se o usuário atual for técnico ou o
 * cliente dono do projeto que referencia esse arquivo). Links externos
 * (VisualDocument com type 'link') não batem com o marcador do bucket e
 * voltam inalterados.
 */
export async function resolveProjectVisualUrl(storedUrl: string, expiresInSeconds = 3600): Promise<string | null> {
  const path = extractStoragePath(storedUrl)
  if (!path) return storedUrl
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error || !data) return null
  return data.signedUrl
}
