'use client'

// Componente de histórico de projetos do cliente.
// Exibe cards de projetos com filtro por status e uma linha do tempo
// cronológica com todas as atualizações registradas em todos os projetos.

import { useMemo, useState } from 'react'
import { FolderKanban } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { CATEGORY_STYLE, DEFAULT_CATEGORY_STYLE } from '@/lib/categories'
import type { ClientProject, ProjectUpdateEntry } from '@/types'
import Link from 'next/link'

/* ── Props ──────────────────────────────────────────────────────── */
interface Props {
  projects: ClientProject[] // projetos do cliente (todos os status)
}

/* ── Mapeamentos de status ──────────────────────────────────────── */

// Label legível em português para cada valor de status do banco
const STATUS_LABEL: Record<string, string> = {
  ativo: 'Ativo', em_andamento: 'Em andamento', concluido: 'Concluído',
  aguardando: 'Aguardando', cancelado: 'Cancelado', pausado: 'Pausado',
}

// Cor hexadecimal de cada status — usada na barra de progresso e pill
const STATUS_COLOR: Record<string, string> = {
  ativo: '#005BFF', em_andamento: '#F59E0B', concluido: '#10B981',
  aguardando: '#94A3B8', cancelado: '#EF4444', pausado: '#6B7280',
}

// Funções auxiliares com fallback para status desconhecido
function statusColor(s: string) { return STATUS_COLOR[s] ?? '#94A3B8' }
function statusLabel(s: string) { return STATUS_LABEL[s] ?? s }

export default function HistoricoClient({ projects }: Props) {
  // Filtro ativo: 'todos' mostra tudo, 'concluido' e 'ativo' filtram por status
  const [filter, setFilter] = useState<'todos' | 'concluido' | 'ativo'>('todos')

  /* ── Linha do tempo global ───────────────────────────────────────
     Achata os updateHistory de todos os projetos em uma lista única
     e ordena do mais recente para o mais antigo. Isso permite ver
     o histórico completo de atualizações independente do projeto. */
  const allEntries = useMemo(() => {
    const entries: Array<ProjectUpdateEntry & { projectId: string; projectTitle: string; category?: string | null }> = []
    for (const p of projects) {
      const history = p.client_progress?.updateHistory ?? []
      for (const e of history) {
        // Enriquece cada entrada com dados do projeto pai para exibir contexto
        entries.push({ ...e, projectId: p.id, projectTitle: p.title, category: p.category })
      }
    }
    // Ordena por data decrescente (mais recente primeiro)
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [projects])

  /* ── Projetos filtrados ──────────────────────────────────────────
     Aplica o filtro de status selecionado na lista de projetos. */
  const visible = useMemo(() => {
    if (filter === 'todos') return projects
    return projects.filter(p => p.status === filter)
  }, [projects, filter])

  /* ── Estado vazio ────────────────────────────────────────────────
     Exibido quando o cliente ainda não tem projetos cadastrados. */
  if (!projects.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E3E7F0]">
          <FolderKanban size={28} className="text-[#94A3B8]" aria-hidden="true" />
        </div>
        <p className="font-bold text-[#0B1020]">Nenhum projeto encontrado</p>
        <p className="mt-1 text-sm text-[#5D6475]">Seu histórico aparecerá aqui quando você tiver projetos.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* ── FILTROS DE STATUS ────────────────────────────────────────
          Três opções: Todos / Ativo / Concluído. O botão ativo fica
          com fundo azul, os demais ficam em branco com borda. */}
      <div className="flex flex-wrap gap-2">
        {(['todos', 'ativo', 'concluido'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded-full border px-4 py-1.5 text-xs font-bold transition-colors"
            style={filter === f
              ? { background: '#005BFF', borderColor: '#005BFF', color: '#fff' }
              : { background: '#fff', borderColor: '#E3E7F0', color: '#5D6475' }}
          >
            {f === 'todos' ? 'Todos' : statusLabel(f)}
          </button>
        ))}
      </div>

      {/* ── CARDS DE PROJETOS ────────────────────────────────────────
          Lista de projetos filtrados. Cada card é um link para a
          página de detalhes do projeto com barra de progresso e status. */}
      <section aria-label="Projetos">
        <div className="space-y-3">
          {visible.map(p => {
            const cat = p.category ?? 'Software'
            // Estilo visual da categoria (cor, borda, fundo do ícone)
            const cs = CATEGORY_STYLE[cat] ?? DEFAULT_CATEGORY_STYLE
            // Cor do status para a barra de progresso e pill
            const sc = statusColor(p.status)
            return (
              <Link
                key={p.id}
                href={`/dashboard/projetos/${p.id}`}
                className="flex items-center gap-4 rounded-2xl border border-[#E3E7F0] bg-white p-4 transition-all hover:border-[#005BFF]/30 hover:shadow-[0_4px_20px_rgba(0,91,255,0.08)]"
              >
                {/* Ícone de pasta com cor da categoria */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: cs.bg }}>
                  <FolderKanban size={18} style={{ color: cs.text }} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#0B1020]">{p.title}</p>
                  {/* Tempo relativo da última atualização */}
                  <p className="mt-0.5 text-xs text-[#94A3B8]">Atualizado {timeAgo(p.updated_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Barra de progresso — visível apenas em telas sm+ */}
                  <div className="hidden sm:flex items-center gap-1.5">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#E3E7F0]">
                      {/* Preenchimento colorido pelo status */}
                      <div className="h-full rounded-full" style={{ width: `${p.progress}%`, background: sc }} />
                    </div>
                    <span className="text-xs font-bold" style={{ color: sc }}>{p.progress}%</span>
                  </div>
                  {/* Pill de status com cor e fundo derivados do status */}
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${sc}15`, color: sc }}>
                    {statusLabel(p.status)}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ── LINHA DO TEMPO DE ATUALIZAÇÕES ───────────────────────────
          Exibida somente se houver entradas de histórico registradas.
          Cada entrada mostra: dot colorido pela categoria, título da
          atualização, tempo relativo, projeto de origem e descrição. */}
      {allEntries.length > 0 && (
        <section aria-label="Histórico de atualizações">
          <h2 className="mb-4 text-base font-bold text-[#0B1020]">Linha do tempo</h2>
          <div className="relative space-y-0">
            {allEntries.map((e, i) => {
              // Estilo visual pela categoria do projeto que gerou a atualização
              const cs = CATEGORY_STYLE[e.category ?? 'Software'] ?? DEFAULT_CATEGORY_STYLE
              return (
                <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* Linha vertical conectando os dots — não aparece no último item */}
                  {i < allEntries.length - 1 && (
                    <div className="absolute left-[11px] top-6 bottom-0 w-px bg-[#E3E7F0]" aria-hidden="true" />
                  )}
                  {/* Dot colorido pela categoria do projeto */}
                  <div className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-sm" style={{ background: cs.bg }}>
                    <div className="h-2 w-2 rounded-full" style={{ background: cs.text }} />
                  </div>
                  {/* Card da atualização com título, projeto e descrição */}
                  <div className="flex-1 rounded-xl border border-[#E3E7F0] bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-[#0B1020]">{e.title}</p>
                      {/* Tempo relativo da atualização */}
                      <span className="shrink-0 text-[10px] text-[#94A3B8]">{timeAgo(e.date)}</span>
                    </div>
                    {/* Nome do projeto de origem da atualização */}
                    <p className="mt-0.5 text-xs text-[#5D6475]">{e.projectTitle}</p>
                    {/* Descrição opcional (nem toda atualização tem) */}
                    {e.description && (
                      <p className="mt-1.5 text-xs leading-relaxed text-[#5D6475]">{e.description}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
