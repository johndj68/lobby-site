'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  Search, FolderKanban, BookOpen, TrendingUp,
  Tag, FileText, Clock, Signal, ArrowRight, AlertCircle, Loader2,
} from 'lucide-react'
import Container from '@/components/layout/Container'
import { createClient } from '@/lib/supabase'
import { projects as staticProjects, resources as staticResources } from '@/lib/data'
import ProjectMockup from '@/components/cards/ProjectMockup'
import ResourceCover from '@/components/cards/ResourceCover'

/* ── Types ── */
interface ProjectResult {
  id: string; title: string; desc: string; category: string
  slug: string; imageUrl: string; impact?: string; tags: string[]
}
interface ResourceResult {
  id: string; title: string; desc: string; category: string
  format?: string; readTime?: string; level?: string; fileUrl: string
}

/* ── Category styles ── */
const CAT: Record<string, { bg: string; text: string; border: string }> = {
  Software:       { bg: 'rgba(0,91,255,0.08)',   text: '#005BFF', border: 'rgba(0,91,255,0.22)'   },
  Automação:      { bg: 'rgba(123,44,255,0.08)', text: '#7B2CFF', border: 'rgba(123,44,255,0.22)' },
  Dados:          { bg: 'rgba(0,163,255,0.08)',  text: '#007ACC', border: 'rgba(0,163,255,0.22)'  },
  Cibersegurança: { bg: 'rgba(5,150,105,0.08)',  text: '#059669', border: 'rgba(5,150,105,0.22)'  },
}
const DEFAULT_CAT = { bg: 'rgba(93,100,117,0.08)', text: '#5D6475', border: 'rgba(93,100,117,0.22)' }

/* ── Skeleton ── */
function Skeleton() {
  return (
    <div className="animate-pulse space-y-10">
      {[0, 1].map(s => (
        <div key={s}>
          <div className="mb-5 h-5 w-32 rounded-lg bg-[#E3E7F0]" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white">
                <div className="h-40 bg-[#F7F8FC]" />
                <div className="p-5 space-y-2">
                  <div className="h-3 w-16 rounded bg-[#E3E7F0]" />
                  <div className="h-4 w-4/5 rounded bg-[#E3E7F0]" />
                  <div className="h-3 w-full rounded bg-[#F7F8FC]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Main ── */
export default function BuscaClient({ initialQ }: { initialQ: string }) {
  const router   = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [term,      setTerm]      = useState(initialQ)
  const [query,     setQuery]     = useState(initialQ)
  const [projects,  setProjects]  = useState<ProjectResult[]>([])
  const [resources, setResources] = useState<ResourceResult[]>([])
  const [loading,   setLoading]   = useState(!!initialQ)
  const supabaseRef = useRef(createClient())

  /* Reage à mudança de query durante o render (não no efeito) — evita o commit
     intermediário com resultados/loading desatualizados antes do fetch iniciar. */
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    if (!query.trim()) { setProjects([]); setResources([]); setLoading(false) }
    else setLoading(true)
  }

  /* ── Fetch on query change ─────────────────────────────────────── */
  useEffect(() => {
    if (!query.trim()) return

    const like = `%${query.trim()}%`
    const q    = query.toLowerCase()
    const sb   = supabaseRef.current

    Promise.all([
      sb.from('lobby_projects')
        .select('id,title,description,category,slug,image_url,impact,tags')
        .or(`title.ilike.${like},description.ilike.${like},category.ilike.${like},impact.ilike.${like}`)
        .limit(9),

      sb.from('resource_metadata')
        .select('id,title,description,category,file_name,format,read_time,level')
        .or(`title.ilike.${like},description.ilike.${like},category.ilike.${like}`)
        .limit(8),
    ]).then(([{ data: dbP }, { data: dbR }]) => {
      /* Projetos ── DB + estáticos extras */
      const dbPSlugs = new Set((dbP ?? []).map(p => p.slug))
      const extraP = staticProjects.filter(p =>
        !dbPSlugs.has(p.slug) && (
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.category as string).toLowerCase().includes(q) ||
          (p.impact ?? '').toLowerCase().includes(q) ||
          (p.tags ?? []).some(t => t.toLowerCase().includes(q))
        )
      )
      setProjects([
        ...(dbP ?? []).map(p => ({
          id: p.id, title: p.title, desc: p.description,
          category: p.category, slug: p.slug,
          imageUrl: p.image_url ?? '', impact: p.impact, tags: p.tags ?? [],
        })),
        ...extraP.map(p => ({
          id: p.id, title: p.title, desc: p.description,
          category: p.category as string, slug: p.slug,
          imageUrl: p.imageUrl, impact: p.impact, tags: p.tags ?? [],
        })),
      ])

      /* Recursos ── DB + estáticos extras */
      const dbRFiles = new Set((dbR ?? []).map(r => r.file_name))
      const extraR = staticResources.filter(r =>
        (r.title.toLowerCase().includes(q) ||
         r.description.toLowerCase().includes(q) ||
         (r.category as string).toLowerCase().includes(q)) &&
        !dbRFiles.has(r.fileUrl.split('/').pop() ?? '')
      )
      const bucket = sb.storage.from('materials')
      setResources([
        ...(dbR ?? []).map(r => ({
          id: r.id, title: r.title, desc: r.description, category: r.category,
          format: r.format, readTime: r.read_time, level: r.level,
          fileUrl: bucket.getPublicUrl(r.file_name).data.publicUrl,
        })),
        ...extraR.map(r => ({
          id: r.id, title: r.title, desc: r.description, category: r.category as string,
          format: r.format, readTime: r.readTime, level: r.level, fileUrl: r.fileUrl,
        })),
      ])

      setLoading(false)
    })
  }, [query])

  /* ── Submit ── */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = term.trim()
    if (!t) return
    setQuery(t)
    router.replace(`/busca?q=${encodeURIComponent(t)}`, { scroll: false })
  }

  const total = projects.length + resources.length

  return (
    <div className="relative overflow-hidden bg-[#F7F8FC] min-h-screen">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,91,255,0.06),transparent_40%)]" />
        <div className="absolute inset-0 opacity-[0.14] bg-[radial-gradient(circle_at_1px_1px,rgba(0,91,255,0.14)_1px,transparent_0)] bg-[size:28px_28px]" />
      </div>

      <Container className="relative z-10 py-12">

        {/* ── Search bar inline ── */}
        <form onSubmit={handleSubmit}
          className="mb-10 flex items-center gap-3 overflow-hidden rounded-2xl border border-[#E3E7F0] bg-white px-5 py-3.5 shadow-[0_8px_40px_rgba(11,16,32,0.08)] focus-within:border-[#005BFF]/40 focus-within:ring-4 focus-within:ring-[#005BFF]/10 transition-all"
        >
          <Search size={20} style={{ color: '#005BFF' }} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Buscar projetos, materiais, categorias..."
            autoFocus
            className="flex-1 bg-transparent text-base font-medium text-[#0B1020] placeholder:text-[#5D6475]/60 outline-none"
          />
          {loading && <Loader2 size={18} className="shrink-0 animate-spin text-[#005BFF]" />}
          {term.trim() && !loading && (
            <button type="submit"
              className="shrink-0 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5">
              Buscar
            </button>
          )}
        </form>

        {/* ── Quick suggestions (sem query) ── */}
        {!query && !loading && (
          <div className="flex flex-col items-center gap-6 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ background: 'linear-gradient(135deg, rgba(0,91,255,0.10), rgba(123,44,255,0.10))' }}>
              <Search size={28} style={{ color: '#005BFF' }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                O que você está procurando?
              </h1>
              <p className="mt-2 text-sm text-[#5D6475]">Pesquise projetos, materiais e soluções.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {['Software', 'Automação', 'Dados', 'Cibersegurança', 'Dashboard', 'Relatórios'].map(s => (
                <button key={s} type="button"
                  onClick={() => { setTerm(s); setQuery(s); router.replace(`/busca?q=${encodeURIComponent(s)}`, { scroll: false }) }}
                  className="rounded-full border border-[#E3E7F0] bg-white px-4 py-2 text-sm font-semibold text-[#5D6475] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#005BFF]/30 hover:text-[#005BFF]">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && <Skeleton />}

        {/* ── Results ── */}
        {!loading && query && (
          <>
            {/* Header de resultados */}
            <div className="mb-8 flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Resultados para{' '}
                <span style={{ background: 'linear-gradient(135deg, #005BFF, #7B2CFF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  &quot;{query}&quot;
                </span>
              </h2>
              <span className="rounded-full border border-[#E3E7F0] bg-white px-3 py-1 text-xs font-semibold text-[#5D6475]">
                {total} resultado{total !== 1 ? 's' : ''}
              </span>
            </div>

            {total === 0 ? (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#005BFF]/[0.08]">
                  <AlertCircle size={24} style={{ color: '#005BFF' }} />
                </div>
                <h3 className="text-lg font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  Nenhum resultado encontrado
                </h3>
                <p className="max-w-sm text-sm text-[#5D6475]">
                  Tente termos diferentes ou explore nossas seções.
                </p>
                <div className="flex gap-3">
                  <Link href="/projetos" className="rounded-xl border border-[#E3E7F0] bg-white px-5 py-2.5 text-sm font-semibold text-[#0B1020] shadow-sm transition-all hover:border-[#005BFF]/30">
                    Ver projetos
                  </Link>
                  <Link href="/recursos" className="rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5">
                    Ver materiais
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-12">

                {/* Projetos */}
                {projects.length > 0 && (
                  <div>
                    <div className="mb-5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FolderKanban size={17} style={{ color: '#005BFF' }} />
                        <h3 className="text-base font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Projetos</h3>
                        <span className="rounded-full bg-[#005BFF]/[0.08] px-2.5 py-0.5 text-xs font-bold text-[#005BFF]">{projects.length}</span>
                      </div>
                      <Link href="/projetos" className="flex items-center gap-1 text-xs font-semibold text-[#005BFF] hover:gap-2 transition-all">
                        Ver todos <ArrowRight size={12} />
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {projects.map(p => {
                        const cat = CAT[p.category] ?? DEFAULT_CAT
                        return (
                          <Link key={p.id} href={`/projetos/${p.slug}`}
                            className="group flex flex-col overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 shadow-[0_8px_40px_rgba(11,16,32,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/25 hover:shadow-[0_20px_60px_rgba(0,91,255,0.12)]"
                          >
                            <div className="relative h-44 overflow-hidden transition-transform duration-500 group-hover:scale-[1.02]">
                              {p.imageUrl?.startsWith('http') ? (
                                <Image src={p.imageUrl} alt={p.title} fill className="object-cover" sizes="33vw" />
                              ) : (
                                <ProjectMockup slug={p.slug} category={p.category} />
                              )}
                            </div>
                            <div className="flex flex-1 flex-col p-5">
                              <span className="mb-2 inline-flex self-start rounded-full border px-2.5 py-0.5 text-[10px] font-semibold"
                                style={{ background: cat.bg, color: cat.text, borderColor: cat.border }}>
                                {p.category}
                              </span>
                              <h4 className="mb-1.5 text-sm font-bold leading-snug text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                                {p.title}
                              </h4>
                              <p className="text-xs leading-relaxed text-[#5D6475] line-clamp-2">{p.desc}</p>
                              {p.impact && (
                                <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[#005BFF]">
                                  <TrendingUp size={11} />{p.impact}
                                </div>
                              )}
                              {p.tags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {p.tags.slice(0, 3).map(t => (
                                    <span key={t} className="flex items-center gap-1 rounded-full border border-[#E3E7F0] bg-[#F7F8FC] px-2 py-0.5 text-[10px] text-[#5D6475]">
                                      <Tag size={8} />{t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Recursos */}
                {resources.length > 0 && (
                  <div>
                    <div className="mb-5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen size={17} style={{ color: '#7B2CFF' }} />
                        <h3 className="text-base font-bold text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Materiais</h3>
                        <span className="rounded-full bg-[#7B2CFF]/[0.08] px-2.5 py-0.5 text-xs font-bold text-[#7B2CFF]">{resources.length}</span>
                      </div>
                      <Link href="/recursos" className="flex items-center gap-1 text-xs font-semibold text-[#7B2CFF] hover:gap-2 transition-all">
                        Ver todos <ArrowRight size={12} />
                      </Link>
                    </div>
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                      {resources.map(r => {
                        const cat = CAT[r.category] ?? DEFAULT_CAT
                        return (
                          <div key={r.id}
                            className="group flex overflow-hidden rounded-3xl border border-[#E3E7F0] bg-white/90 shadow-[0_8px_40px_rgba(11,16,32,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#005BFF]/25 hover:shadow-[0_20px_60px_rgba(0,91,255,0.10)]"
                          >
                            <div className="relative w-32 shrink-0 overflow-hidden transition-transform duration-500 group-hover:scale-[1.02]">
                              <ResourceCover category={r.category} />
                            </div>
                            <div className="flex flex-1 flex-col p-5">
                              <span className="mb-2 inline-flex self-start rounded-full border px-2.5 py-0.5 text-[10px] font-semibold"
                                style={{ background: cat.bg, color: cat.text, borderColor: cat.border }}>
                                {r.category}
                              </span>
                              <h4 className="mb-1 text-sm font-bold leading-snug text-[#0B1020]" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                                {r.title}
                              </h4>
                              <p className="text-xs leading-relaxed text-[#5D6475] line-clamp-2">{r.desc}</p>
                              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                                {r.format   && <span className="flex items-center gap-1 rounded-full border border-[#E3E7F0] bg-[#F7F8FC] px-2 py-0.5 text-[10px] text-[#5D6475]"><FileText size={8} />{r.format}</span>}
                                {r.readTime && <span className="flex items-center gap-1 rounded-full border border-[#E3E7F0] bg-[#F7F8FC] px-2 py-0.5 text-[10px] text-[#5D6475]"><Clock size={8} />{r.readTime}</span>}
                                {r.level    && <span className="flex items-center gap-1 rounded-full border border-[#E3E7F0] bg-[#F7F8FC] px-2 py-0.5 text-[10px] text-[#5D6475]"><Signal size={8} />{r.level}</span>}
                              </div>
                              <a href={r.fileUrl} download
                                className="group/dl mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#7B2CFF] transition-all hover:text-[#005BFF]">
                                Baixar grátis <ArrowRight size={12} className="transition-transform group-hover/dl:translate-x-1" />
                              </a>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Container>
    </div>
  )
}
