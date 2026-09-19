'use client'

/**
 * ResourceCover — HTML/Tailwind visual covers per category.
 * No external images — all rendered via CSS.
 *
 * Mapping: category string → variant → cover component.
 * Add new categories to CATEGORY_MAP to get custom covers.
 *
 * Tune per variant:
 *   gradient:  from/via/to colors on the outer div
 *   accents:   bg-white/[X] on decorative circles
 *   bar chart: height percentages in the DataCover bars array
 *   code text: update the strings in SoftwareCover
 */

import { Shield, Bot, BarChart3, Code2, BookOpen, Settings2 } from 'lucide-react'

type Variant = 'automation' | 'security' | 'data' | 'software' | 'generic'

const CATEGORY_MAP: Record<string, Variant> = {
  'Automação':      'automation',
  'Cibersegurança': 'security',
  'Dados':          'data',
  'Software':       'software',
}

/* ── Automação ───────────────────────────────────────────── */
function AutomationCover() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#7B2CFF] to-[#005BFF] p-4 flex flex-col justify-between">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/[0.06]" aria-hidden="true" />
      <div className="absolute -left-4 bottom-4 h-16 w-16 rounded-full bg-white/[0.05]" aria-hidden="true" />

      <div>
        <p className="text-[8px] font-bold uppercase tracking-widest text-white/55">Guia Prático</p>
        <p className="mt-1 text-[13px] font-bold leading-snug text-white">
          Automação<br />para PMEs
        </p>
      </div>

      {/* Flow element */}
      <div className="my-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-white/20">
            <Bot size={8} className="text-white" aria-hidden="true" />
          </div>
          <div className="h-1 flex-1 rounded-full bg-white/20" />
          <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-white/20">
            <Settings2 size={8} className="text-white" aria-hidden="true" />
          </div>
        </div>
        <div className="h-1 w-4/5 rounded-full bg-white/15" />
        <div className="h-1 w-3/5 rounded-full bg-white/10" />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-sm bg-white/25" />
          <div className="h-3 w-3 rounded-sm bg-white/18" />
          <div className="h-3 w-3 rounded-sm bg-white/12" />
        </div>
        <p className="text-[7px] font-bold uppercase tracking-widest text-white/40">LOBBY</p>
      </div>
    </div>
  )
}

/* ── Cibersegurança ──────────────────────────────────────── */
function SecurityCover() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#059669] to-[#0d9488] p-4 flex flex-col justify-between">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/[0.06]" aria-hidden="true" />

      <div>
        <p className="text-[8px] font-bold uppercase tracking-widest text-white/55">Checklist</p>
        <p className="mt-1 text-[13px] font-bold leading-snug text-white">
          Cibersegurança<br />Empresarial
        </p>
      </div>

      {/* Check items */}
      <div className="my-2 flex flex-col gap-1.5">
        {[1, 2, 3].map(n => (
          <div key={n} className="flex items-center gap-2">
            <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-white/40">
              <div className="h-1.5 w-1.5 rounded-full bg-white/90" />
            </div>
            <div className="h-1 flex-1 rounded-full bg-white/20" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Shield size={14} className="text-white/40" aria-hidden="true" />
        <p className="text-[7px] font-bold uppercase tracking-widest text-white/40">LOBBY</p>
      </div>
    </div>
  )
}

/* ── Dados ───────────────────────────────────────────────── */
function DataCover() {
  const bars = [40, 65, 50, 80, 55, 75]
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#0ea5e9] to-[#005BFF] p-4 flex flex-col justify-between">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/[0.06]" aria-hidden="true" />

      <div>
        <p className="text-[8px] font-bold uppercase tracking-widest text-white/55">Guia Prático</p>
        <p className="mt-1 text-[13px] font-bold leading-snug text-white">
          Análise<br />de Dados
        </p>
      </div>

      {/* Mini bar chart — tune height values here */}
      <div className="my-1 flex h-12 items-end gap-1">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${h}%`, background: `rgba(255,255,255,${0.15 + i * 0.04})` }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <BarChart3 size={13} className="text-white/40" aria-hidden="true" />
        <p className="text-[7px] font-bold uppercase tracking-widest text-white/40">LOBBY</p>
      </div>
    </div>
  )
}

/* ── Software ────────────────────────────────────────────── */
function SoftwareCover() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#005BFF] via-[#4338ca] to-[#7B2CFF] p-4 flex flex-col justify-between">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/[0.06]" aria-hidden="true" />

      <div>
        <p className="text-[8px] font-bold uppercase tracking-widest text-white/55">Boas Práticas</p>
        <p className="mt-1 text-[13px] font-bold leading-snug text-white">
          Software<br />sob medida
        </p>
      </div>

      {/* Code block — tune strings here */}
      <div className="my-1 rounded-lg bg-black/20 px-3 py-2 font-mono text-[8px] leading-relaxed text-white/60">
        <span className="text-[#00A3FF]/80">fn</span>{' '}
        <span className="text-white/80">build</span>() {'{'}<br />
        &nbsp; return <span className="text-white/60">true</span><br />
        {'}'}
      </div>

      <div className="flex items-center justify-between">
        <Code2 size={13} className="text-white/40" aria-hidden="true" />
        <p className="text-[7px] font-bold uppercase tracking-widest text-white/40">LOBBY</p>
      </div>
    </div>
  )
}

/* ── Generic fallback ────────────────────────────────────── */
function GenericCover({ category }: { category: string }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#005BFF] to-[#7B2CFF] p-4 flex flex-col justify-between">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/[0.06]" aria-hidden="true" />

      <div>
        <p className="text-[8px] font-bold uppercase tracking-widest text-white/55">E-Book</p>
        <p className="mt-1 text-[13px] font-bold leading-snug text-white">{category}</p>
      </div>

      <BookOpen size={20} className="my-2 text-white/30" aria-hidden="true" />

      <p className="self-end text-[7px] font-bold uppercase tracking-widest text-white/40">LOBBY</p>
    </div>
  )
}

/* ── Public component ────────────────────────────────────── */
interface ResourceCoverProps {
  category: string
}

export default function ResourceCover({ category }: ResourceCoverProps) {
  const variant = CATEGORY_MAP[category] ?? 'generic'
  if (variant === 'automation') return <AutomationCover />
  if (variant === 'security')   return <SecurityCover />
  if (variant === 'data')       return <DataCover />
  if (variant === 'software')   return <SoftwareCover />
  return <GenericCover category={category} />
}
