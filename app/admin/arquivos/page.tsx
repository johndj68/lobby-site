import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'
import ArquivosClient from './ArquivosClient'

export default async function ArquivosPage() {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireTechnicianSession(supabase)

  // Lista os arquivos existentes no bucket 'materials'
  const { data: files } = await supabase.storage.from('materials').list('', {
    limit: 100,
    sortBy: { column: 'created_at', order: 'desc' },
  })

  // Busca metadados salvos (nome, categoria etc.) para cada arquivo
  const { data: metadata } = await supabase
    .from('resource_metadata')
    .select('*')

  return (
    <ArquivosClient
      user={user}
      profile={profile}
      isLeader={profile?.is_leader === true}
      initialFiles={files ?? []}
      initialMetadata={metadata ?? []}
    />
  )
}
