'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Grid3x3, ImageOff, Play, ChevronRight, Check,
  Users, Layers, LifeBuoy, BookOpen, HelpCircle, Sparkles,
} from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { formatCurrencyBRL } from '@/lib/finance'
import { isAllowedImageUrl } from '@/lib/services/app-publish'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import GalleryLightbox, { type GalleryImage } from './GalleryLightbox'

export interface CommercialPlan {
  id: string
  name: string
  currency: string
  price: number | null
  billingPeriod: string | null
  features: string[]
  usersLimit: number | null
  supportLevel: string | null
}

export interface CommercialContent {
  name: string | null
  developerName: string | null
  category: string | null
  shortDescription: string | null
  fullDescription: string | null
  logoUrl: string | null
  gallery: { url: string; altText: string | null; type: string }[]
  videoUrl: string | null
  benefits: { title: string }[]
  features: { name: string; description: string | null }[]
  targetAudience: string | null
  integrations: { name: string; url: string | null }[]
  platforms: string[]
  languages: string[]
  requirements: string | null
  plans: CommercialPlan[]
  activation: { method: string | null; link: string | null; supportEmail: string | null; instructions: string[] } | null
  documentationUrl: string | null
  history: { title: string; description: string }[]
  trustSignals: { title: string; url: string | null }[]
  faq: { question: string; answer: string }[]
}

export interface EditSectionTarget { route: string; tab?: string; field?: string }

interface Props {
  content: CommercialContent
  viewport: 'desktop' | 'mobile'
  /** Presente apenas quando a versão exibida é o rascunho editável — versão
   *  enviada/publicada é estável e não ganha atalho direto de edição (a
   *  seção 12 pede encaminhar ao fluxo de rascunho em vez de editar
   *  diretamente um conteúdo que já foi congelado num envio). */
  editing: { appId: string } | null
}

const BILLING_LABEL: Record<string, string> = {
  'one-time': 'Pagamento único', monthly: 'Assinatura mensal', yearly: 'Assinatura anual', lifetime: 'Licença vitalícia',
}
const ACTIVATION_METHOD_LABEL: Record<string, string> = {
  rescue_code: 'Código de resgate', api: 'Integração via API', oauth: 'Login OAuth', manual: 'Ativação manual',
}
const ALLOWED_VIDEO_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'player.vimeo.com', 'vimeo.com']

function safeImage(url: string | null): string | null {
  return url && isAllowedImageUrl(url) ? url : null
}

function embeddableVideo(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (!ALLOWED_VIDEO_HOSTS.includes(u.hostname)) return null
    if (u.hostname.includes('youtu.be')) return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v')
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop()
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
    return null
  } catch {
    return null
  }
}

function EditLink({ editing, target, label = 'Editar esta seção' }: { editing: { appId: string } | null; target: EditSectionTarget; label?: string }) {
  if (!editing) return null
  const params = target.tab ? `?tab=${target.tab}` : ''
  const hash = target.field ? `#${target.field}` : ''
  return (
    <Link href={`/dashboard/meus-app/novo/${editing.appId}/${target.route}${params}${hash}`}
      className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold hover:underline" style={{ color: colors.primary }}>
      {label} <ChevronRight size={11} aria-hidden="true" />
    </Link>
  )
}

const NAV_ITEMS: { id: string; label: string }[] = [
  { id: 'visao-geral', label: 'Visão geral' },
  { id: 'funcionalidades', label: 'Funcionalidades' },
  { id: 'planos', label: 'Planos' },
  { id: 'faq', label: 'Perguntas frequentes' },
]

export default function AppCommercialView({ content, viewport, editing }: Props) {
  const isMobile = viewport === 'mobile'
  const gallery = content.gallery.filter(g => safeImage(g.url))
  const mainImage = gallery.find(g => g.type === 'main') ?? gallery[0] ?? null
  const thumbs = gallery.filter(g => g !== mainImage)
  const [selectedThumbUrl, setSelectedThumbUrl] = useState<string | null>(null)
  const displayedImage = gallery.find(g => g.url === selectedThumbUrl) ?? mainImage
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const video = embeddableVideo(content.videoUrl)

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(content.plans[0]?.id ?? null)
  const selectedPlan = content.plans.find(p => p.id === selectedPlanId) ?? content.plans[0] ?? null

  const availableNav = NAV_ITEMS.filter(n => {
    if (n.id === 'visao-geral') return !!(content.shortDescription || content.fullDescription || content.benefits.length)
    if (n.id === 'funcionalidades') return content.features.length > 0
    if (n.id === 'planos') return content.plans.length > 0
    if (n.id === 'faq') return content.faq.length > 0
    return false
  })

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={isMobile ? 'flex flex-col gap-6' : 'grid gap-8'} style={!isMobile ? { gridTemplateColumns: 'minmax(0,1fr) 360px' } : undefined}>
      {/* Coluna principal */}
      <div className="min-w-0 space-y-8">
        {/* Identidade */}
        <div className="flex items-start gap-4">
          {safeImage(content.logoUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={safeImage(content.logoUrl)!} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" style={{ border: `1px solid ${colors.border}` }} />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl" style={{ background: colors.backgroundAlt }}>
              <Grid3x3 size={28} style={{ color: colors.textMuted }} aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className={isMobile ? 'text-xl font-bold' : 'text-2xl font-bold'} style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>
              {content.name || 'Aplicativo sem nome'}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={{ color: colors.textSecondary }}>
              {content.developerName && <span>{content.developerName}</span>}
              {content.developerName && content.category && <span aria-hidden="true">•</span>}
              {content.category && <span>{content.category}</span>}
            </div>
            {content.shortDescription && (
              <p className="mt-2 text-sm" style={{ color: colors.text }}>{content.shortDescription}</p>
            )}
          </div>
        </div>

        {/* Navegação interna */}
        {availableNav.length > 1 && (
          <nav aria-label="Seções do anúncio" className="flex flex-wrap gap-2 border-y py-3" style={{ borderColor: colors.borderLight }}>
            {availableNav.map(n => (
              <button key={n.id} type="button" onClick={() => scrollTo(n.id)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-[#F7F8FC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ color: colors.textSecondary, outlineColor: colors.primary }}>
                {n.label}
              </button>
            ))}
          </nav>
        )}

        {/* Galeria */}
        <div>
          {displayedImage ? (
            <button type="button" onClick={() => setLightboxIndex(gallery.findIndex(g => g.url === displayedImage.url))}
              className="block w-full overflow-hidden rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ outlineColor: colors.primary }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={displayedImage.url} alt={displayedImage.altText || ''} className="aspect-video w-full object-cover" style={{ border: `1px solid ${colors.border}` }} />
            </button>
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl" style={{ background: colors.backgroundAlt, border: `1px solid ${colors.border}` }}>
              <ImageOff size={28} style={{ color: colors.textMuted }} aria-hidden="true" />
              {editing ? (
                <p className="text-xs" style={{ color: colors.textMuted }}>Adicione uma imagem principal para completar seu anúncio.</p>
              ) : (
                <p className="text-xs" style={{ color: colors.textMuted }}>Nenhuma imagem cadastrada.</p>
              )}
            </div>
          )}

          {(thumbs.length > 0 || video) && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {mainImage && (
                <button type="button" onClick={() => setSelectedThumbUrl(mainImage.url)}
                  className="h-16 w-24 shrink-0 overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2"
                  style={{ border: `2px solid ${displayedImage?.url === mainImage.url ? colors.primary : 'transparent'}`, outlineColor: colors.primary }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mainImage.url} alt="" className="h-full w-full object-cover" />
                </button>
              )}
              {thumbs.map((t, i) => (
                <button key={t.url + i} type="button" onClick={() => setSelectedThumbUrl(t.url)}
                  className="h-16 w-24 shrink-0 overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2"
                  style={{ border: `2px solid ${displayedImage?.url === t.url ? colors.primary : 'transparent'}`, outlineColor: colors.primary }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
              {video && (
                <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg" style={{ background: colors.text }}>
                  <Play size={18} style={{ color: '#fff' }} aria-hidden="true" />
                </div>
              )}
            </div>
          )}

          {video && (
            <div className="mt-4 aspect-video w-full overflow-hidden rounded-xl" style={{ border: `1px solid ${colors.border}` }}>
              <iframe src={video} title="Vídeo demonstrativo" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full" />
            </div>
          )}
        </div>

        {/* Visão geral */}
        {(content.shortDescription || content.fullDescription || content.benefits.length > 0) && (
          <section id="visao-geral" className="scroll-mt-24 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold" style={{ color: colors.text }}>Visão geral</h2>
              <EditLink editing={editing} target={{ route: 'editar', field: 'f-short' }} />
            </div>
            {content.fullDescription && <p className="text-sm leading-relaxed" style={{ color: colors.textSecondary }}>{content.fullDescription}</p>}
            {content.benefits.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {content.benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: colors.text }}>
                    <Check size={15} className="mt-0.5 shrink-0" style={{ color: colors.primary }} aria-hidden="true" /> {b.title}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Funcionalidades */}
        {content.features.length > 0 && (
          <section id="funcionalidades" className="scroll-mt-24 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold" style={{ color: colors.text }}>Funcionalidades</h2>
              <EditLink editing={editing} target={{ route: 'editar', tab: 'features', field: 'f-features' }} />
            </div>
            <div className={isMobile ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}>
              {content.features.map((f, i) => (
                <div key={i} className="rounded-xl border p-3.5" style={{ borderColor: colors.borderLight }}>
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} style={{ color: colors.primary }} aria-hidden="true" />
                    <p className="text-sm font-semibold" style={{ color: colors.text }}>{f.name}</p>
                  </div>
                  {f.description && <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>{f.description}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Ideal para */}
        {content.targetAudience && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-base font-bold" style={{ color: colors.text }}><Users size={16} aria-hidden="true" /> Ideal para</h2>
              <EditLink editing={editing} target={{ route: 'editar', field: 'f-audience' }} />
            </div>
            <p className="text-sm" style={{ color: colors.textSecondary }}>{content.targetAudience}</p>
          </section>
        )}

        {/* Integrações e compatibilidade */}
        {(content.integrations.length > 0 || content.platforms.length > 0 || content.languages.length > 0 || content.requirements) && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-base font-bold" style={{ color: colors.text }}><Layers size={16} aria-hidden="true" /> Integrações e compatibilidade</h2>
              <EditLink editing={editing} target={{ route: 'editar' }} />
            </div>
            {content.integrations.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {content.integrations.map((it, i) => (
                  it.url ? (
                    <a key={i} href={it.url} target="_blank" rel="noopener noreferrer" className="rounded-full px-2.5 py-1 text-xs font-medium hover:underline" style={{ background: colors.backgroundAlt, color: colors.text }}>{it.name}</a>
                  ) : (
                    <span key={i} className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: colors.backgroundAlt, color: colors.text }}>{it.name}</span>
                  )
                ))}
              </div>
            )}
            {content.platforms.length > 0 && (
              <p className="text-xs" style={{ color: colors.textSecondary }}><span className="font-semibold" style={{ color: colors.text }}>Plataformas: </span>{content.platforms.join(', ')}</p>
            )}
            {content.languages.length > 0 && (
              <p className="text-xs" style={{ color: colors.textSecondary }}><span className="font-semibold" style={{ color: colors.text }}>Idiomas: </span>{content.languages.join(', ')}</p>
            )}
            {content.requirements && (
              <p className="text-xs" style={{ color: colors.textSecondary }}><span className="font-semibold" style={{ color: colors.text }}>Requisitos: </span>{content.requirements}</p>
            )}
          </section>
        )}

        {/* Oferta e planos (comparação completa) */}
        {content.plans.length > 0 && (
          <section id="planos" className="scroll-mt-24 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold" style={{ color: colors.text }}>Oferta e planos</h2>
              <EditLink editing={editing} target={{ route: 'planos' }} />
            </div>
            <div className={isMobile ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}>
              {content.plans.map(plan => (
                <button key={plan.id} type="button" onClick={() => setSelectedPlanId(plan.id)}
                  className="rounded-xl border p-4 text-left transition-colors"
                  style={{ borderColor: plan.id === selectedPlanId ? colors.primary : colors.borderLight, background: plan.id === selectedPlanId ? '#EFF6FF' : '#fff' }}>
                  <p className="text-sm font-bold" style={{ color: colors.text }}>{plan.name}</p>
                  <p className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                    {plan.billingPeriod ? BILLING_LABEL[plan.billingPeriod] ?? plan.billingPeriod : 'Condição não definida'}
                  </p>
                  <p className="mt-2 text-lg font-bold" style={{ color: colors.text }}>
                    {plan.price !== null ? (plan.currency === 'BRL' ? formatCurrencyBRL(plan.price) : `${plan.currency} ${plan.price.toLocaleString('pt-BR')}`) : 'Sob consulta'}
                  </p>
                  {plan.features.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {plan.features.slice(0, 4).map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: colors.textSecondary }}>
                          <Check size={12} className="mt-0.5 shrink-0" style={{ color: colors.primary }} aria-hidden="true" /> {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  {plan.usersLimit !== null && (
                    <p className="mt-2 text-xs" style={{ color: colors.textSecondary }}>Até {plan.usersLimit} usuário(s)</p>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Ativação e suporte */}
        {content.activation && (content.activation.link || content.activation.supportEmail || content.activation.instructions.length > 0 || content.documentationUrl) && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-base font-bold" style={{ color: colors.text }}><LifeBuoy size={16} aria-hidden="true" /> Ativação e suporte</h2>
              <EditLink editing={editing} target={{ route: 'ativacao' }} />
            </div>
            {content.activation.instructions.length > 0 && (
              <ol className="space-y-1.5">
                {content.activation.instructions.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: colors.textSecondary }}>
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: colors.primary }}>{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: colors.textSecondary }}>
              {content.activation.supportEmail && <span><span className="font-semibold" style={{ color: colors.text }}>Suporte: </span>{content.activation.supportEmail}</span>}
              {content.documentationUrl && <a href={content.documentationUrl} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: colors.primary }}>Ver documentação</a>}
            </div>
          </section>
        )}

        {/* Sobre o produto */}
        {(content.history.length > 0 || content.trustSignals.length > 0) && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-base font-bold" style={{ color: colors.text }}><BookOpen size={16} aria-hidden="true" /> Sobre o produto</h2>
              <EditLink editing={editing} target={{ route: 'editar', tab: 'history' }} />
            </div>
            {content.history.map((h, i) => (
              <div key={i}>
                <p className="text-sm font-semibold" style={{ color: colors.text }}>{h.title}</p>
                <p className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>{h.description}</p>
              </div>
            ))}
            {content.trustSignals.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {content.trustSignals.map((s, i) => (
                  s.url ? (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline" style={{ color: colors.primary }}>{s.title}</a>
                  ) : (
                    <span key={i} className="text-xs font-semibold" style={{ color: colors.text }}>{s.title}</span>
                  )
                ))}
              </div>
            )}
          </section>
        )}

        {/* FAQ */}
        {content.faq.length > 0 && (
          <section id="faq" className="scroll-mt-24 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-base font-bold" style={{ color: colors.text }}><HelpCircle size={16} aria-hidden="true" /> Perguntas frequentes</h2>
              <EditLink editing={editing} target={{ route: 'editar', tab: 'faq' }} />
            </div>
            <Accordion>
              {content.faq.map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-sm font-semibold" style={{ color: colors.text }}>{item.question}</AccordionTrigger>
                  <AccordionContent style={{ color: colors.textSecondary }}>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}
      </div>

      {/* Resumo da oferta */}
      <div className={isMobile ? '' : 'min-w-0'}>
        <div className={isMobile ? '' : 'sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto'}>
          <div className="rounded-xl border bg-white p-5" style={{ borderColor: colors.border, boxShadow: '0 8px 40px rgba(11,16,32,0.06)' }}>
            {content.plans.length === 0 ? (
              <div>
                <p className="text-sm font-bold" style={{ color: colors.text }}>Oferta ainda não configurada.</p>
                <p className="mt-1 text-xs" style={{ color: colors.textSecondary }}>Adicione seus planos na etapa Oferta e planos.</p>
                <EditLink editing={editing} target={{ route: 'planos' }} label="Ir para Oferta e planos" />
              </div>
            ) : selectedPlan ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                    {selectedPlan.billingPeriod ? BILLING_LABEL[selectedPlan.billingPeriod] ?? selectedPlan.billingPeriod : 'Modalidade não definida'}
                  </p>
                  <p className="mt-1 text-lg font-bold" style={{ color: colors.text }}>{selectedPlan.name}</p>
                  <p className="mt-1 text-2xl font-bold" style={{ color: colors.text }}>
                    {selectedPlan.price !== null ? (selectedPlan.currency === 'BRL' ? formatCurrencyBRL(selectedPlan.price) : `${selectedPlan.currency} ${selectedPlan.price.toLocaleString('pt-BR')}`) : 'Sob consulta'}
                  </p>
                </div>

                {content.plans.length > 1 && (
                  <div className="flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: colors.borderLight }}>
                    {content.plans.map(p => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: colors.text }}>
                        <input type="radio" name="plan" checked={p.id === selectedPlanId} onChange={() => setSelectedPlanId(p.id)} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                )}

                {selectedPlan.features.length > 0 && (
                  <ul className="space-y-1 border-t pt-3" style={{ borderColor: colors.borderLight }}>
                    {selectedPlan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: colors.textSecondary }}>
                        <Check size={12} className="mt-0.5 shrink-0" style={{ color: colors.primary }} aria-hidden="true" /> {f}
                      </li>
                    ))}
                  </ul>
                )}
                {selectedPlan.usersLimit !== null && (
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Até {selectedPlan.usersLimit} usuário(s)</p>
                )}
                {selectedPlan.supportLevel && (
                  <p className="text-xs" style={{ color: colors.textSecondary }}><span className="font-semibold" style={{ color: colors.text }}>Suporte: </span>{selectedPlan.supportLevel}</p>
                )}
                {content.activation?.method && (
                  <p className="text-xs" style={{ color: colors.textSecondary }}><span className="font-semibold" style={{ color: colors.text }}>Ativação: </span>{ACTIVATION_METHOD_LABEL[content.activation.method] ?? content.activation.method}</p>
                )}

                <button type="button" disabled
                  className="mt-2 w-full cursor-not-allowed rounded-lg border px-4 py-2.5 text-sm font-semibold"
                  style={{ borderColor: colors.border, color: colors.textMuted, background: colors.backgroundAlt }}>
                  Compra indisponível na prévia
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <GalleryLightbox images={gallery as GalleryImage[]} openIndex={lightboxIndex} onClose={() => setLightboxIndex(null)}
        onNavigate={i => setLightboxIndex(i)} />
    </div>
  )
}
