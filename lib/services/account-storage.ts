import { createClient } from '@/lib/supabase'

const BUCKET = 'accounts-attachments'
const MAX_MB = 15

export class AccountAttachmentError extends Error {}

function safeFileName(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()
}

/**
 * Bucket privado (mesma receita de materials-paid) — armazena só o path,
 * nunca uma URL pública (não existe URL pública, o bucket é `public: false`).
 * Leitura sempre via resolveAccountAttachmentUrl (signed URL de curta duração).
 */
export async function uploadAccountAttachment(file: File): Promise<string> {
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new AccountAttachmentError(`Arquivo muito grande (máx ${MAX_MB} MB).`)
  }
  const supabase = createClient()
  const path = `${Date.now()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: '3600' })
  if (error) throw new AccountAttachmentError(error.message)
  return path
}

export async function resolveAccountAttachmentUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds)
  if (error || !data) return null
  return data.signedUrl
}
