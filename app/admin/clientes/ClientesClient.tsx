'use client'

// Hooks de estado e memoização para busca e cálculos derivados
import { useState, useMemo } from 'react'
// Ícones usados nos cards de estatísticas e lista de clientes
import { Search, Users, FolderKanban, ArrowRight, TrendingUp } from 'lucide-react'
// Utilitário para exibir tempo relativo (ex: "há 2 dias")
import { timeAgo } from '@/lib/utils'
// Link do Next.js para navegação para a página de detalhes de cada projeto
import Link from 'next/link'

/* Estrutura de um cliente agrupado com seus projetos.
   Cada linha representa um cliente único com todos os projetos associados. */
interface ClientRow {
  client_id:      string
  client_name?:   string
  client_email?:  string
  client_company?: string
  // Lista de projetos do cliente com progresso e status atual
  projects: {
    id:         string
    title:      string
    status:     string
    progress:   number   // Percentual de conclusão (0–100)
    updated_at: string
  }[]
}

/* Props do componente — recebe a lista de clientes já agrupada pelo Server Component */
interface Props {
  clients: ClientRow[]
}

/* Mapeamento de status de projeto para cor hexadecimal.
   Usado nas bolinhas indicadoras e nas barras de progresso. */
const STATUS_COLOR: Record<string, string> = {
  ativo:          '#005BFF',
  em_andamento:   '#F59E0B',
  concluido:      '#10B981',
  aguardando:     '#94A3B8',
  cancelado:      '#EF4444',
  pausado:        '#6B7280',
}

/* Mapeamento de status de projeto para rótulo em português exibido na interface */
const STATUS_LABEL: Record<string, string> = {
  ativo:          'Ativo',
  em_andamento:   'Em andamento',
  concluido:      'Concluído',
  aguardando:     'Aguardando',
  cancelado:      'Cancelado',
  pausado:        'Pausado',
}

/* Retorna a cor associada ao status — usa cinza como fallback para statuses desconhecidos */
function sc(s: string) { return STATUS_COLOR[s] ?? '#94A3B8' }

/* Retorna o rótulo legível do status — usa o próprio valor como fallback */
function sl(s: string) { return STATUS_LABEL[s] ?? s }

/* ── Componente principal de listagem de clientes ──────────────────────── */
export default function ClientesClient({ clients }: Props) {
  // Texto de busca livre (nome, email ou empresa do cliente)
  const [search, setSearch] = useState('')

  /* Lista filtrada de clientes aplicando a busca textual.
     useMemo evita recalcular a cada render quando search e clients não mudam. */
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return clients
    return clients.filter(c =>
      c.client_name?.toLowerCase().includes(q) ||
      c.client_email?.toLowerCase().includes(q) ||
      c.client_company?.toLowerCase().includes(q)
    )
  }, [clients, search])

  // Total de projetos somando todos os clientes — exibido no card de estatísticas
  const totalProjects = clients.reduce((a, c) => a + c.projects.length, 0)
  // Clientes que têm ao menos um projeto ativo ou em andamento
  const activeClients = clients.filter(c =>
    c.projects.some(p => p.status === 'ativo' || p.status === 'em_andamento')
  ).length

  return (
    <div className="space-y-6">

      {/* ── Cards de estatísticas: total de clientes, projetos e clientes com projeto ativo ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: 'Clientes',          value: clients.length,  icon: Users,         color: '#005BFF' },
          { label: 'Projetos',          value: totalProjects,   icon: FolderKanban,  color: '#7B2CFF' },
          { label: 'Com proj. ativos',  value: activeClients,   icon: TrendingUp,    color: '#10B981' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2">
              <Icon size={14} style={{ color }} aria-hidden="true" />
              <span className="text-xs text-white/50">{label}</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Campo de busca por nome, e-mail ou empresa ── */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
        <input
          type="search"
          placeholder="Buscar por nome, e-mail ou empresa…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white placeholder-white/30 focus:border-[#005BFF]/50 focus:outline-none focus:ring-1 focus:ring-[#005BFF]/30"
        />
      </div>

      {/* ── Lista de clientes ou estado vazio ── */}
      {filtered.length === 0 ? (
        /* Estado vazio: exibido quando a busca não retorna resultados */
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
          <Users size={28} className="mx-auto mb-3 text-white/20" aria-hidden="true" />
          <p className="text-sm text-white/40">Nenhum cliente encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(client => {
            // Data da atualização mais recente entre todos os projetos do cliente
            const lastUpdated = client.projects.reduce<string | null>((best, p) => {
              if (!best) return p.updated_at
              return new Date(p.updated_at) > new Date(best) ? p.updated_at : best
            }, null)

            return (
              <div key={client.client_id} className="rounded-2xl border border-white/10 bg-white/5">

                {/* Cabeçalho do card do cliente: avatar com inicial, nome, email, empresa e contagem */}
                <div className="flex items-center gap-4 p-4">
                  {/* Avatar com a inicial do nome ou email do cliente */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#005BFF]/15 text-sm font-bold text-[#005BFF]">
                    {(client.client_name?.[0] ?? client.client_email?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* Nome preferencial; cai para email se não houver nome cadastrado */}
                    <p className="truncate text-sm font-bold text-white">
                      {client.client_name ?? client.client_email ?? 'Cliente'}
                    </p>
                    <p className="truncate text-xs text-white/40">
                      {client.client_company ? `${client.client_company} · ` : ''}{client.client_email}
                    </p>
                  </div>
                  {/* Contagem de projetos, tempo de atualização e link de detalhes */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold text-white">{client.projects.length} proj.</p>
                    <p className="text-[10px] text-white/40">atualiz. {timeAgo(lastUpdated)}</p>
                  </div>
                  <Link
                    href={`/admin/clientes/${client.client_id}`}
                    className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label="Ver detalhes do cliente"
                  >
                    <ArrowRight size={12} />
                  </Link>
                </div>

                {/* Lista de projetos do cliente (máximo 3 visíveis; excedente indicado por contador) */}
                {client.projects.length > 0 && (
                  <div className="border-t border-white/5 px-4 pb-4 pt-3">
                    <div className="space-y-2">
                      {/* Exibe até 3 projetos como links para a página de detalhe do projeto */}
                      {client.projects.slice(0, 3).map(p => (
                        <Link
                          key={p.id}
                          href={`/admin/projetos-clientes/${p.id}`}
                          className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/5"
                        >
                          {/* Bolinha colorida indicando o status do projeto */}
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: sc(p.status) }} aria-hidden="true" />
                          {/* Título do projeto truncado */}
                          <span className="min-w-0 flex-1 truncate text-xs text-white/70">{p.title}</span>
                          {/* Rótulo do status com a cor correspondente */}
                          <span className="shrink-0 text-[10px] font-bold" style={{ color: sc(p.status) }}>
                            {sl(p.status)}
                          </span>
                          {/* Barra de progresso compacta (0–100%) */}
                          <div className="flex shrink-0 items-center gap-1">
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${p.progress}%`, background: sc(p.status) }}
                              />
                            </div>
                            <span className="text-[10px] text-white/40">{p.progress}%</span>
                          </div>
                          <ArrowRight size={11} className="shrink-0 text-white/20" aria-hidden="true" />
                        </Link>
                      ))}
                      {/* Indicador de projetos ocultos quando o cliente tem mais de 3 */}
                      {client.projects.length > 3 && (
                        <p className="pl-3 text-xs text-white/30">+{client.projects.length - 3} projetos</p>
                      )}
                    </div>
                  </div>
                )}

              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
