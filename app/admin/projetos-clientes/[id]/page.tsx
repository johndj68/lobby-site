import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireTechnicianSession } from '@/lib/services/profile'

interface Props { params: Promise<{ id: string }> }

// Rota de conveniência: redireciona para a lista de projetos com o projeto pré-aberto.
// Links de /admin/clientes e /admin/clientes/[id] usam este padrão.
export default async function ProjetoClienteDetalhe({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  await requireTechnicianSession(supabase)

  redirect(`/admin/projetos-clientes?open=${id}`)
}
