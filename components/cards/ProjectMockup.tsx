'use client'

/**
 * ProjectMockup — UI mockups rendered in HTML/Tailwind (no images).
 *
 * Mapping: slug → variant → specific mockup component.
 * Add slugs to SLUG_MAP to assign custom mockups to projects.
 *
 * Tune:
 *   Bar heights  → percentage values in FinanceMockup / ReportsMockup
 *   Colors       → rgba/color values per mockup
 *   Layout       → grid-cols / gap values per mockup
 */

type Variant = 'finance' | 'automation' | 'portal' | 'management' | 'security' | 'reports' | 'default'

const SLUG_MAP: Record<string, Variant> = {
  'dashboard-financeiro-inteligente': 'finance',
  'automacao-atendimento-comercial':  'automation',
  'portal-do-cliente':                'portal',
  'sistema-gestao-interna':           'management',
  'checklist-seguranca-digital':      'security',
  'automacao-de-relatorios':          'reports',
}

/* ── Finance Dashboard ──────────────────────────────────────────── */
function FinanceMockup() {
  const bars = [30, 55, 42, 72, 50, 82, 62]
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#EFF6FF] via-[#F5F3FF] to-[#EEF8FF]">
      <div className="absolute inset-4 rounded-2xl border border-white/75 bg-white/80 p-4 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-2 w-24 rounded-full bg-[#0B1020]/20" />
            <div className="h-1.5 w-16 rounded-full bg-[#0B1020]/10" />
          </div>
          <div className="rounded-lg bg-[#005BFF]/10 px-2 py-1 text-[9px] font-bold text-[#005BFF]">
            Mai 2025
          </div>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {[
            { label: 'Receita',  accent: '#005BFF', barW: 'w-14' },
            { label: 'Despesas', accent: '#7B2CFF', barW: 'w-10' },
            { label: 'Lucro',    accent: '#00A3FF', barW: 'w-12' },
          ].map(({ label, accent, barW }) => (
            <div key={label} className="rounded-xl bg-[#F7F8FC] p-2">
              <div className="mb-1.5 h-1.5 w-10 rounded-full bg-[#5D6475]/20" />
              <div className={`h-3 ${barW} rounded`} style={{ background: `${accent}55` }} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[1.4fr_0.7fr] gap-2">
          <div className="rounded-xl bg-[#F7F8FC] p-2">
            <div className="flex h-16 items-end gap-1">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{ height: `${h}%`, background: i % 2 === 0 ? 'rgba(0,91,255,0.48)' : 'rgba(123,44,255,0.42)' }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center rounded-xl bg-[#F7F8FC]">
            <div className="h-14 w-14 rounded-full border-[9px] border-[#7B2CFF]/30 border-r-[#005BFF] border-t-[#00A3FF]" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Automation Kanban ──────────────────────────────────────────── */
function AutomationMockup() {
  const stages = ['Lead', 'Qualif.', 'Proposta', 'Negoc.', 'Fechado']
  const flows  = ['Captura', 'Enrique.', 'Automação', 'Notif.']
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#F5F3FF] via-[#EFF6FF] to-[#F0FEFF]">
      <div className="absolute inset-4 rounded-2xl border border-white/75 bg-white/80 p-3 shadow-lg backdrop-blur">
        <div className="mb-3 grid grid-cols-5 gap-1">
          {stages.map((stage, i) => (
            <div key={stage} className="rounded-lg bg-[#F7F8FC] p-1.5">
              <div className="mb-1.5 h-1 w-full rounded-full" style={{ background: `rgba(123,44,255,${0.14 + i * 0.06})` }} />
              <p className="mb-1.5 text-[8px] font-bold leading-none text-[#0B1020]">{stage}</p>
              <div className="space-y-1">
                <div className="h-5 rounded-md bg-white shadow-sm" />
                {i < 3 && <div className="h-5 rounded-md bg-white shadow-sm" />}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-1">
          {flows.map((item) => (
            <div key={item} className="flex flex-col items-center gap-0.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full border"
                style={{ borderColor: 'rgba(123,44,255,0.22)', background: 'rgba(123,44,255,0.08)' }}
              />
              <span className="text-[7px] font-medium text-[#5D6475]">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Client Portal ──────────────────────────────────────────────── */
function PortalMockup() {
  const items = ['Pedidos', 'Contratos', 'Faturas', 'Suporte']
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#EFF6FF] via-[#F7F8FC] to-[#F5F3FF]">
      <div className="absolute inset-4 overflow-hidden rounded-2xl border border-white/75 bg-white/80 shadow-lg backdrop-blur">
        <div className="flex h-full">
          <div className="flex w-10 flex-col items-center gap-2.5 bg-gradient-to-b from-[#005BFF] to-[#0B2070] py-3">
            {Array.from({ length: 5 }).map((_, n) => (
              <div key={n} className="h-5 w-5 rounded-md bg-white/15" />
            ))}
          </div>
          <div className="flex-1 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="h-2 w-20 rounded-full bg-[#0B1020]/20" />
                <div className="h-1.5 w-32 rounded-full bg-[#5D6475]/15" />
              </div>
              <div className="h-7 w-7 rounded-full bg-[#005BFF]/20" />
            </div>
            <div className="mb-3 grid grid-cols-4 gap-1.5">
              {items.map((item) => (
                <div key={item} className="rounded-xl bg-[#F7F8FC] p-2">
                  <div className="mb-2 h-6 w-6 rounded-lg bg-[#005BFF]/10" />
                  <div className="h-1.5 w-10 rounded-full bg-[#0B1020]/20" />
                  <div className="mt-1 h-1 w-7 rounded-full bg-[#5D6475]/15" />
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-[#F7F8FC] px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="h-1.5 w-20 rounded-full bg-[#0B1020]/20" />
                <div className="h-4 w-16 rounded-full" style={{ background: 'rgba(123,44,255,0.12)' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Management / Task Board ────────────────────────────────────── */
function ManagementMockup() {
  const cols  = ['A Fazer', 'Em andamento', 'Concluído']
  const tasks = [2, 3, 2]
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#F5F3FF] via-[#F7F8FC] to-[#EFF6FF]">
      <div className="absolute inset-4 rounded-2xl border border-white/75 bg-white/80 p-3 shadow-lg backdrop-blur">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="h-2 w-28 rounded-full bg-[#0B1020]/20" />
          <div className="flex gap-1.5">
            {['bg-[#7B2CFF]/20', 'bg-[#005BFF]/20', 'bg-[#10B981]/20'].map((c, i) => (
              <div key={i} className={`h-5 w-5 rounded-full ${c}`} />
            ))}
          </div>
        </div>
        {/* Board */}
        <div className="grid grid-cols-3 gap-2">
          {cols.map((col, ci) => (
            <div key={col} className="rounded-xl bg-[#F7F8FC] p-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[8px] font-bold text-[#0B1020]">{col}</p>
                <span className="text-[8px] font-bold text-[#5D6475]">{tasks[ci]}</span>
              </div>
              <div className="space-y-1.5">
                {Array.from({ length: tasks[ci] }).map((_, ti) => (
                  <div
                    key={ti}
                    className="rounded-lg border border-white bg-white p-1.5 shadow-sm"
                  >
                    <div className="mb-1 h-1.5 w-full rounded-full bg-[#0B1020]/15" />
                    <div
                      className="h-1 rounded-full"
                      style={{ width: `${55 + ci * 14 + ti * 8}%`, background: ci === 0 ? 'rgba(123,44,255,0.30)' : ci === 1 ? 'rgba(0,91,255,0.30)' : 'rgba(16,185,129,0.30)' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Security Checklist ─────────────────────────────────────────── */
function SecurityMockup() {
  const checks = [
    { label: 'Autenticação 2FA',      done: true  },
    { label: 'Criptografia de dados', done: true  },
    { label: 'Backup automático',     done: true  },
    { label: 'Política de acesso',    done: false },
    { label: 'Auditoria de logs',     done: false },
  ]
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#EFF6FF] via-[#F5F3FF] to-[#F0FEFF]">
      <div className="absolute inset-4 rounded-2xl border border-white/75 bg-white/80 p-4 shadow-lg backdrop-blur">
        {/* Shield header */}
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#005BFF]/15 to-[#7B2CFF]/15">
            <div className="h-6 w-5 rounded-t-full border-2 border-[#005BFF]/60" style={{ borderBottom: '2px solid transparent', borderRadius: '50% 50% 40% 40%' }} />
          </div>
          <div>
            <div className="h-2 w-24 rounded-full bg-[#0B1020]/20" />
            <div className="mt-1 h-1.5 w-16 rounded-full bg-[#5D6475]/15" />
          </div>
          <div className="ml-auto rounded-full bg-[#10B981]/12 px-2 py-0.5 text-[8px] font-bold text-[#10B981]">
            68% seguro
          </div>
        </div>
        {/* Progress ring area */}
        <div className="mb-3 flex gap-2">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-[#E3E7F0] border-t-[#005BFF] border-r-[#7B2CFF]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-1.5 rounded-full bg-[#E3E7F0]">
              <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-[#005BFF] to-[#7B2CFF]" />
            </div>
            <div className="h-1.5 rounded-full bg-[#E3E7F0]">
              <div className="h-full w-[45%] rounded-full bg-[#F59E0B]/60" />
            </div>
          </div>
        </div>
        {/* Checklist */}
        <div className="space-y-1.5">
          {checks.map(({ label, done }) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`h-3.5 w-3.5 shrink-0 rounded-full border flex items-center justify-center ${
                  done ? 'border-[#10B981] bg-[#10B981]/15' : 'border-[#E3E7F0]'
                }`}
              >
                {done && <div className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />}
              </div>
              <p className={`text-[8px] font-medium ${done ? 'text-[#0B1020]/60 line-through' : 'text-[#0B1020]/80'}`}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Automated Reports ──────────────────────────────────────────── */
function ReportsMockup() {
  const bars = [45, 72, 58, 88, 65, 92, 70]
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#EFF6FF] via-[#F0FEFF] to-[#F5F3FF]">
      <div className="absolute inset-4 rounded-2xl border border-white/75 bg-white/80 p-4 shadow-lg backdrop-blur">
        {/* Header row */}
        <div className="mb-3 flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-2 w-20 rounded-full bg-[#0B1020]/20" />
            <div className="h-1.5 w-28 rounded-full bg-[#5D6475]/15" />
          </div>
          <div className="flex gap-1.5">
            <div className="rounded-lg bg-[#00A3FF]/12 px-2 py-1 text-[8px] font-bold text-[#007ACC]">Auto</div>
            <div className="rounded-lg bg-[#7B2CFF]/10 px-2 py-1 text-[8px] font-bold text-[#7B2CFF]">PDF</div>
          </div>
        </div>
        {/* Main chart */}
        <div className="mb-2 rounded-xl bg-[#F7F8FC] p-2">
          <div className="flex h-16 items-end gap-1">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t"
                style={{ height: `${h}%`, background: `rgba(0,${91 + i * 10},255,${0.35 + i * 0.04})` }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between px-0.5">
            {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul'].map(m => (
              <span key={m} className="text-[7px] text-[#5D6475]/60">{m}</span>
            ))}
          </div>
        </div>
        {/* Mini docs row */}
        <div className="grid grid-cols-3 gap-1.5">
          {['Receita', 'Custo', 'ROI'].map((label, i) => (
            <div key={label} className="rounded-lg bg-[#F7F8FC] p-1.5">
              <div className="mb-1 h-1.5 w-10 rounded-full bg-[#0B1020]/15" />
              <div className="h-2 rounded" style={{ background: `rgba(0,91,255,${0.20 + i * 0.08})` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Default / Generic ──────────────────────────────────────────── */
function DefaultMockup({ category }: { category: string }) {
  const accentMap: Record<string, string> = {
    'Software':       '#005BFF',
    'Automação':      '#7B2CFF',
    'Dados':          '#00A3FF',
    'Cibersegurança': '#005BFF',
  }
  const accent = accentMap[category] ?? '#005BFF'
  return (
    <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 65% 40%, ${accent}18, transparent 65%)` }}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#EFF6FF] to-[#F5F3FF] opacity-80" />
      <div className="absolute inset-4 rounded-2xl border border-white/70 bg-white/72 p-4 backdrop-blur">
        <div className="mb-2 grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-11 rounded-xl"
              style={{ background: i % 3 === 0 ? `${accent}22` : i % 3 === 1 ? `${accent}12` : '#F7F8FC' }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <div className="h-14 flex-1 rounded-xl" style={{ background: `${accent}14` }} />
          <div className="h-14 w-14 rounded-xl" style={{ background: `${accent}10` }} />
        </div>
      </div>
    </div>
  )
}

/* ── Public component ───────────────────────────────────────────── */
interface ProjectMockupProps {
  slug: string
  category: string
}

export default function ProjectMockup({ slug, category }: ProjectMockupProps) {
  const variant = SLUG_MAP[slug]
  if (variant === 'finance')    return <FinanceMockup />
  if (variant === 'automation') return <AutomationMockup />
  if (variant === 'portal')     return <PortalMockup />
  if (variant === 'management') return <ManagementMockup />
  if (variant === 'security')   return <SecurityMockup />
  if (variant === 'reports')    return <ReportsMockup />
  return <DefaultMockup category={category} />
}
