'use client'

import Link from 'next/link'
import {
  ArrowLeft, User, Mail, Phone, Building2, FileText,
  FolderKanban, TrendingUp, Wallet,
  ShoppingCart, MessageSquare, CheckCircle2,
  ChevronRight, CalendarDays,
} from 'lucide-react'
import { formatCurrencyBRL, formatDateBR } from '@/lib/finance'
import { formatCredits, getCreditPurchaseStyle } from '@/lib/credits'
import { timeAgo } from '@/lib/utils'

/* ── Types ───────────────────────────────────────────────────────────────── */

interface ClientProfile {
  id: string
  full_name: string
  email: string
  company_name?: string | null
  interest_area?: string | null
  phone?: string | null
  document?: string | null
  onboarded: boolean
  created_at: string
}

interface Wallet {
  balance: number
  total_purchased: number
  total_spent: number
}

interface Project {
  id: string
  title: string
  status: string
  progress: number
  priority: string
  deadline?: string | null
  created_at: string
  updated_at: string
}

interface Purchase {
  id: string
  credits_amount: number
  amount_paid: number
  currency: string
  status: string
  created_at: string
}

interface ContactSubmission {
  id: string
  name: string
  email: string
  interest_area?: string | null
  message: string
  created_at: string
}

interface Props {
  clientProfile:  ClientProfile
  wallet:         Wallet | null
  projects:       Project[]
  purchases:      Purchase[]
  contacts:       ContactSubmission[]
}

/* ── Status helpers ──────────────────────────────────────────────────────── */

const STATUS_COLOR: Record<string, string> = {
  solicitado:         '#94A3B8',
  em_analise:         '#F59E0B',
  em_desenvolvimento: '#005BFF',
  em_validacao:       '#7B2CFF',
  concluido:          '#10B981',
  pausado:            '#6B7280',
}

const STATUS_LABEL: Record<string, string> = {
  solicitado:         'Solicitado',
  em_analise:         'Em análise',
  em_desenvolvimento: 'Em desenvolvimento',
  em_validacao:       'Em validação',
  concluido:          'Concluído',
  pausado:            'Pausado',
}

const PRIORITY_COLOR: Record<string, string> = {
  alta:   '#EF4444',
  media:  '#F59E0B',
  baixa:  '#10B981',
}

function sc(s: string) { return STATUS_COLOR[s] ?? '#94A3B8' }
function sl(s: string) { return STATUS_LABEL[s] ?? s }
function pc(p: string) { return PRIORITY_COLOR[p] ?? '#94A3B8' }

/* ── Component ───────────────────────────────────────────────────────────── */

export default function ClienteDetalheClient({ clientProfile, wallet, projects, purchases, contacts }: Props) {
  const initial = (clientProfile.full_name?.[0] ?? clientProfile.email?.[0] ?? '?').toUpperCase()
  const displayName = clientProfile.full_name || clientProfile.email

  const completedProjects = projects.filter(p => p.status === 'concluido').length
  const activeProjects    = projects.filter(p => p.status === 'em_desenvolvimento' || p.status === 'em_analise').length

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/clientes"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Voltar para clientes"
        >
          <ArrowLeft size={14} />
        </Link>
        <div>
          <p className="text-xs text-white/40">Clientes</p>
          <h1 className="text-lg font-bold text-white leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            {displayName}
          </h1>
        </div>
      </div>

      {/* ── Profile card ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">

          {/* Avatar */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#005BFF]/15 text-xl font-bold text-[#005BFF]">
            {initial}
          </div>

          {/* Info grid */}
          <div className="flex-1 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow icon={User}     label="Nome"     value={clientProfile.full_name || '—'} />
            <InfoRow icon={Mail}     label="E-mail"   value={clientProfile.email} />
            <InfoRow icon={Phone}    label="Telefone" value={clientProfile.phone || '—'} />
            <InfoRow icon={Building2}label="Empresa"  value={clientProfile.company_name || '—'} />
            <InfoRow icon={FileText} label="CPF/CNPJ" value={clientProfile.document || '—'} />
            <InfoRow icon={CalendarDays} label="Cliente desde" value={formatDateBR(clientProfile.created_at)} />
          </div>

          {/* Badges */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span
              className="rounded-full px-3 py-1 text-[10px] font-bold"
              style={clientProfile.onboarded
                ? { background: 'rgba(16,185,129,0.12)', color: '#10B981' }
                : { background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }
              }
            >
              {clientProfile.onboarded ? 'Onboarding OK' : 'Aguardando onboarding'}
            </span>
            {clientProfile.interest_area && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-white/50">
                {clientProfile.interest_area}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Saldo créditos"   value={formatCredits(wallet?.balance ?? 0)}         color="#005BFF" icon={Wallet} />
        <StatCard label="Créditos comprad." value={formatCredits(wallet?.total_purchased ?? 0)} color="#7B2CFF" icon={TrendingUp} />
        <StatCard label="Projetos ativos"  value={String(activeProjects)}                       color="#F59E0B" icon={FolderKanban} />
        <StatCard label="Projetos concluíd." value={String(completedProjects)}                  color="#10B981" icon={CheckCircle2} />
      </div>

      {/* ── Projects ───────────────────────────────────────────────────── */}
      <Section title="Projetos" count={projects.length}>
        {projects.length === 0 ? (
          <Empty icon={FolderKanban} text="Nenhum projeto cadastrado" />
        ) : (
          <div className="space-y-2">
            {projects.map(p => (
              <Link
                key={p.id}
                href={`/admin/projetos-clientes/${p.id}`}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 transition-colors hover:bg-white/10"
              >
                <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: sc(p.status) }} />
                <span className="flex-1 min-w-0 truncate text-sm font-medium text-white">{p.title}</span>

                {/* Priority */}
                <span className="hidden text-[10px] font-bold sm:block" style={{ color: pc(p.priority) }}>
                  {p.priority?.toUpperCase()}
                </span>

                {/* Status label */}
                <span className="hidden text-[10px] font-semibold sm:block" style={{ color: sc(p.status) }}>
                  {sl(p.status)}
                </span>

                {/* Progress bar */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${p.progress}%`, background: sc(p.status) }} />
                  </div>
                  <span className="text-[10px] text-white/40">{p.progress}%</span>
                </div>

                {/* Deadline */}
                {p.deadline && (
                  <span className="hidden text-[10px] text-white/30 sm:block">
                    {formatDateBR(p.deadline)}
                  </span>
                )}

                <ChevronRight size={12} className="shrink-0 text-white/20" />
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* ── Credit purchases ───────────────────────────────────────────── */}
      <Section title="Compras de créditos" count={purchases.length}>
        {purchases.length === 0 ? (
          <Empty icon={ShoppingCart} text="Nenhuma compra registrada" />
        ) : (
          <div className="divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
            {purchases.map(p => {
              const style = getCreditPurchaseStyle(p.status as import('@/types').CreditPurchaseStatus)
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm bg-white/[0.02]">
                  <ShoppingCart size={13} className="shrink-0 text-white/30" />
                  <span className="flex-1 text-white/80">{formatCredits(p.credits_amount)}</span>
                  <span className="text-white/50">{formatCurrencyBRL(p.amount_paid)}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: style.bg, color: style.color }}>
                    {style.label}
                  </span>
                  <span className="text-[10px] text-white/30">{timeAgo(p.created_at)}</span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* ── Contact submissions ────────────────────────────────────────── */}
      <Section title="Solicitações de contato" count={contacts.length}>
        {contacts.length === 0 ? (
          <Empty icon={MessageSquare} text="Nenhuma solicitação de contato" />
        ) : (
          <div className="space-y-3">
            {contacts.map(c => (
              <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-white/70">
                    {c.interest_area ?? 'Geral'}
                  </span>
                  <span className="text-[10px] text-white/30">{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-sm text-white/60 leading-relaxed line-clamp-3">{c.message}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>, label: string, value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={12} className="mt-0.5 shrink-0 text-white/30" />
      <div className="min-w-0">
        <p className="text-[10px] text-white/30 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-white/80 truncate">{value}</p>
      </div>
    </div>
  )
}

function StatCard({ label, value, color, icon: Icon }: { label: string, value: string, color: string, icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color }}><Icon size={12} /></span>
        <span className="text-[10px] text-white/40 truncate">{label}</span>
      </div>
      <p className="text-xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{value}</p>
    </div>
  )
}

function Section({ title, count, children }: { title: string, count: number, children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-white">{title}</h2>
        {count > 0 && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/40">{count}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function Empty({ icon: Icon, text }: { icon: React.ComponentType<{ size?: number; className?: string }>, text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
      <Icon size={22} className="mx-auto mb-2 text-white/15" />
      <p className="text-xs text-white/30">{text}</p>
    </div>
  )
}
