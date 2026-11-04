'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Monitor, Smartphone, Maximize2, X, Pencil, AlertTriangle, ChevronRight } from 'lucide-react'
import { colors as C } from '@/lib/design-tokens'
import { formatDateTimeBR } from '@/lib/marketplace'
import AppCommercialView, { type CommercialContent } from '@/components/marketplace/AppCommercialView'

export type PreviaVersion = 'draft' | 'submission' | 'published'

interface VersionOption { key: PreviaVersion; label: string; href: string }
interface Pendency { label: string; editRoute: string; editTab?: string; editField?: string }

interface Props {
  appId: string
  appName: string
  version: PreviaVersion
  versionLabel: string
  versionDateISO: string | null
  bannerNote: string
  availableVersions: VersionOption[]
  backHref: { href: string; label: string }
  editAction: { href: string; label: string; note?: string } | null
  hasUnpublishedDraftChanges: boolean
  content: CommercialContent
  pendencies: Pendency[]
  canEdit: boolean
}

export default function PreviaClient({
  appId, appName, version, versionLabel, versionDateISO, bannerNote, availableVersions,
  backHref, editAction, hasUnpublishedDraftChanges, content, pendencies, canEdit,
}: Props) {
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const [expanded, setExpanded] = useState(false)
  const expandTriggerRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!expanded) return
    closeBtnRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded])

  function closeExpanded() {
    setExpanded(false)
    expandTriggerRef.current?.focus()
  }

  const editing = version === 'draft' && canEdit ? { appId } : null

  return (
    <div className="space-y-5">
      {!expanded && (
        <>
          <p className="text-xs" style={{ color: C.textSecondary }}>
            <Link href="/dashboard/meus-app" className="hover:underline">Meus aplicativos</Link> /{' '}
            {appName} / Prévia
          </p>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-xl font-bold" style={{ color: C.text, fontFamily: 'Space Grotesk, sans-serif' }}>Prévia do anúncio</h1>
              <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Confira como seu aplicativo será apresentado no marketplace.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: '#EFF6FF', color: C.primary }}>
                  {versionLabel}
                </span>
                {versionDateISO && <span className="text-xs" style={{ color: C.textSecondary }}>{formatDateTimeBR(versionDateISO)}</span>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {availableVersions.length > 1 && (
                <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: C.border }}>
                  {availableVersions.map(v => (
                    <Link key={v.key} href={v.href}
                      className="rounded-md px-2.5 py-1 text-xs font-semibold"
                      style={{ background: v.key === version ? C.primary : 'transparent', color: v.key === version ? '#fff' : C.textSecondary }}>
                      {v.label}
                    </Link>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: C.border }}>
                <button type="button" onClick={() => setViewport('desktop')} aria-pressed={viewport === 'desktop'} aria-label="Visualizar em desktop"
                  className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: viewport === 'desktop' ? C.backgroundAlt : 'transparent', color: C.text }}>
                  <Monitor size={14} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setViewport('mobile')} aria-pressed={viewport === 'mobile'} aria-label="Visualizar em celular"
                  className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: viewport === 'mobile' ? C.backgroundAlt : 'transparent', color: C.text }}>
                  <Smartphone size={14} aria-hidden="true" />
                </button>
              </div>
              <button ref={expandTriggerRef} type="button" onClick={() => setExpanded(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>
                <Maximize2 size={13} aria-hidden="true" /> Expandir prévia
              </button>
              {editAction && (
                <Link href={editAction.href} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.primary, color: C.primary }}>
                  <Pencil size={13} aria-hidden="true" /> {editAction.label}
                </Link>
              )}
              <Link href={backHref.href} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>
                <ArrowLeft size={13} aria-hidden="true" /> {backHref.label}
              </Link>
            </div>
          </div>

          {/* Faixa discreta de prévia privada — nunca faz parte do componente comercial */}
          <div className="rounded-xl border px-4 py-3 text-xs" style={{ borderColor: C.border, background: C.backgroundAlt, color: C.textSecondary }}>
            <p className="font-semibold" style={{ color: C.text }}>Prévia privada — confira o conteúdo antes da publicação.</p>
            <p className="mt-0.5">{bannerNote}</p>
            {hasUnpublishedDraftChanges && (
              <p className="mt-0.5 flex items-center gap-1.5" style={{ color: '#B45309' }}>
                <AlertTriangle size={12} aria-hidden="true" /> Você está visualizando alterações ainda não publicadas.
              </p>
            )}
            {editAction?.note && <p className="mt-0.5">{editAction.note}</p>}
          </div>

          {pendencies.length > 0 && (
            <div className="rounded-xl border p-4" style={{ borderColor: C.border, background: '#fff' }}>
              <p className="text-xs font-semibold" style={{ color: C.text }}>Pendências deste rascunho</p>
              <ul className="mt-2 space-y-1.5">
                {pendencies.map((p, i) => {
                  const params = p.editTab ? `?tab=${p.editTab}` : ''
                  const hash = p.editField ? `#${p.editField}` : ''
                  return (
                    <li key={i}>
                      <Link href={`/dashboard/meus-app/novo/${appId}/${p.editRoute}${params}${hash}`}
                        className="inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: C.primary }}>
                        {p.label} <ChevronRight size={11} aria-hidden="true" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}

      <div className={expanded ? 'fixed inset-0 z-[60] overflow-y-auto bg-white' : ''}>
        {expanded && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3 sm:px-8" style={{ borderColor: C.border }}>
            <p className="text-sm font-semibold" style={{ color: C.text }}>Prévia do anúncio — {versionLabel}</p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: C.border }}>
                <button type="button" onClick={() => setViewport('desktop')} aria-pressed={viewport === 'desktop'} aria-label="Visualizar em desktop"
                  className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: viewport === 'desktop' ? C.backgroundAlt : 'transparent', color: C.text }}>
                  <Monitor size={14} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setViewport('mobile')} aria-pressed={viewport === 'mobile'} aria-label="Visualizar em celular"
                  className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: viewport === 'mobile' ? C.backgroundAlt : 'transparent', color: C.text }}>
                  <Smartphone size={14} aria-hidden="true" />
                </button>
              </div>
              <button ref={closeBtnRef} type="button" onClick={closeExpanded}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>
                <X size={13} aria-hidden="true" /> Fechar
              </button>
            </div>
          </div>
        )}

        <div className={expanded ? 'mx-auto max-w-[1320px] p-4 sm:p-8' : viewport === 'mobile' ? 'mx-auto max-w-[390px]' : 'mx-auto w-full max-w-[1320px]'}>
          <div className={!expanded && viewport === 'mobile' ? 'rounded-2xl border p-4' : ''} style={!expanded && viewport === 'mobile' ? { borderColor: C.border, background: '#fff' } : undefined}>
            <AppCommercialView content={content} viewport={viewport} editing={editing} />
          </div>
        </div>
      </div>
    </div>
  )
}
