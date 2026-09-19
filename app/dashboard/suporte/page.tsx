import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Suporte | LOBBY', robots: { index: false, follow: false } }

import Link from 'next/link'
import { MessageCircle, Mail, Clock, FolderKanban, HelpCircle, ArrowRight, Phone } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
/* Perguntas frequentes exibidas na seção FAQ.
   Cada item contém a pergunta (q) e a resposta (a).
   O conteúdo é estático e não requer busca no banco de dados. */
const FAQ = [
  { q: 'Como acompanho o andamento do meu projeto?', a: 'Acesse "Projetos" no menu lateral. Cada projeto tem uma página com timeline, progresso detalhado e relatórios.' },
  { q: 'Posso solicitar ajustes durante o desenvolvimento?', a: 'Sim. Use a aba "Relatórios" dentro do projeto para aprovar etapas ou solicitar ajustes formalmente.' },
  { q: 'Como faço para pagar com créditos?', a: 'Se seu projeto tem pagamento por créditos habilitado, o card de pagamento aparece na página do projeto. Acesse "Meus créditos" para ver seu saldo.' },
  { q: 'Minha mensagem não foi respondida, o que faço?', a: 'As mensagens são respondidas em até 24h úteis. Se for urgente, use o WhatsApp abaixo ou envie um e-mail.' },
  { q: 'Como baixo os materiais que comprei?', a: 'Acesse "Meus downloads" no menu lateral. Todos os materiais adquiridos ficam disponíveis lá.' },
]

/* Página de suporte do cliente (rota: /dashboard/suporte).
   Componente Server Component — acessa o banco diretamente no servidor.
   Exibe canais de atendimento, horário, acesso rápido a seções do dashboard e FAQ. */
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'contato@lobby.tech'

export default async function SuportePage() {
  // Cria o cliente Supabase autenticado no lado do servidor
  const supabase = await createServerSupabaseClient()
  // Valida a sessão do cliente e obtém user + profile; redireciona para login se não autenticado
  const { user, profile } = await requireClientSession(supabase)

  /* Extrai o primeiro nome para personalizar a saudação.
     Fallback em cascata: nome completo → prefixo do e-mail → 'cliente'. */
  const firstName = profile?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'cliente'

  return (
    <>
      <div className="space-y-8">
        {/* ── Cabeçalho da página ──
            Título fixo e saudação personalizada com o primeiro nome do usuário. */}
        <div>
          <h1 className="text-2xl font-bold text-[#0B1020] sm:text-3xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Suporte
          </h1>
          <p className="mt-1 text-sm text-[#5D6475]">Olá, {firstName}. Como podemos ajudar?</p>
        </div>

        {/* ── Canais de atendimento ──
            Três opções: chat interno, e-mail e formulário de contato.
            Cada card é clicável e tem cor de destaque própria. */}
        <section aria-label="Canais de atendimento">
          <h2 className="mb-4 text-base font-bold text-[#0B1020]">Fale com a gente</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Canal 1: Chat com o técnico — redireciona para /dashboard/mensagens */}
            <Link href="/dashboard/mensagens"
              className="group flex flex-col gap-3 rounded-2xl border border-[#E3E7F0] bg-white p-5 transition-all hover:border-[#005BFF]/30 hover:shadow-[0_4px_20px_rgba(0,91,255,0.08)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#005BFF]/10">
                <MessageCircle size={18} className="text-[#005BFF]" aria-hidden="true" />
              </div>
              <div>
                <p className="font-bold text-[#0B1020]">Chat com o técnico</p>
                <p className="mt-0.5 text-xs text-[#5D6475]">Fale diretamente com a equipe responsável pelo seu projeto.</p>
              </div>
              {/* Label de ação com seta — cor azul */}
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-[#005BFF]">
                Abrir mensagens <ArrowRight size={11} aria-hidden="true" />
              </span>
            </Link>

            {/* Canal 2: E-mail */}
            <a href={`mailto:${SUPPORT_EMAIL}`}
              className="group flex flex-col gap-3 rounded-2xl border border-[#E3E7F0] bg-white p-5 transition-all hover:border-[#7B2CFF]/30 hover:shadow-[0_4px_20px_rgba(123,44,255,0.08)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7B2CFF]/10">
                <Mail size={18} className="text-[#7B2CFF]" aria-hidden="true" />
              </div>
              <div>
                <p className="font-bold text-[#0B1020]">E-mail</p>
                <p className="mt-0.5 text-xs text-[#5D6475]">Envie um e-mail e responderemos em até 24h úteis.</p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-[#7B2CFF]">
                {SUPPORT_EMAIL} <ArrowRight size={11} aria-hidden="true" />
              </span>
            </a>

            {/* Canal 3: Formulário de contato — redireciona para /contato */}
            <Link href="/contato"
              className="group flex flex-col gap-3 rounded-2xl border border-[#E3E7F0] bg-white p-5 transition-all hover:border-[#10B981]/30 hover:shadow-[0_4px_20px_rgba(16,185,129,0.08)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10B981]/10">
                <Phone size={18} className="text-[#10B981]" aria-hidden="true" />
              </div>
              <div>
                <p className="font-bold text-[#0B1020]">Formulário de contato</p>
                <p className="mt-0.5 text-xs text-[#5D6475]">Abra uma solicitação formal para nossa equipe.</p>
              </div>
              {/* Label de ação — cor verde esmeralda */}
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-[#10B981]">
                Abrir formulário <ArrowRight size={11} aria-hidden="true" />
              </span>
            </Link>
          </div>
        </section>

        {/* ── Banner de horário de atendimento ──
            Informa o horário comercial e a política de resposta fora do expediente. */}
        <div className="flex items-start gap-3 rounded-2xl border border-[#E3E7F0] bg-[#F7F8FC] px-4 py-3">
          <Clock size={15} className="mt-0.5 shrink-0 text-[#94A3B8]" aria-hidden="true" />
          <p className="text-xs text-[#5D6475]">
            Atendimento em dias úteis, das <strong className="text-[#0B1020]">8h às 18h</strong>. Mensagens fora do horário são respondidas no próximo dia útil.
          </p>
        </div>

        {/* ── Acesso rápido ──
            Atalhos para as seções mais acessadas do dashboard do cliente. */}
        <section aria-label="Acesso rápido">
          <h2 className="mb-4 text-base font-bold text-[#0B1020]">Acesso rápido</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Atalho para a página de projetos */}
            <Link href="/dashboard/projetos"
              className="flex items-center gap-3 rounded-xl border border-[#E3E7F0] bg-white px-4 py-3 transition-colors hover:border-[#005BFF]/30">
              <FolderKanban size={16} className="shrink-0 text-[#005BFF]" aria-hidden="true" />
              <span className="text-sm font-medium text-[#0B1020]">Ver meus projetos</span>
              {/* Seta decorativa alinhada à direita */}
              <ArrowRight size={13} className="ml-auto text-[#94A3B8]" aria-hidden="true" />
            </Link>
            {/* Atalho para a página de mensagens */}
            <Link href="/dashboard/mensagens"
              className="flex items-center gap-3 rounded-xl border border-[#E3E7F0] bg-white px-4 py-3 transition-colors hover:border-[#005BFF]/30">
              <MessageCircle size={16} className="shrink-0 text-[#005BFF]" aria-hidden="true" />
              <span className="text-sm font-medium text-[#0B1020]">Minhas mensagens</span>
              <ArrowRight size={13} className="ml-auto text-[#94A3B8]" aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* ── FAQ — Perguntas frequentes ──
            Lista estática de dúvidas comuns renderizada a partir do array FAQ.
            Cada item exibe ícone de interrogação, pergunta em negrito e resposta. */}
        <section aria-label="Perguntas frequentes">
          <h2 className="mb-4 text-base font-bold text-[#0B1020]">Perguntas frequentes</h2>
          <div className="space-y-3">
            {FAQ.map((item, i) => (
              <div key={i} className="rounded-2xl border border-[#E3E7F0] bg-white p-4">
                <div className="flex items-start gap-3">
                  {/* Ícone de interrogação — identifica visualmente cada item do FAQ */}
                  <HelpCircle size={15} className="mt-0.5 shrink-0 text-[#005BFF]" aria-hidden="true" />
                  <div>
                    {/* Pergunta em negrito */}
                    <p className="text-sm font-bold text-[#0B1020]">{item.q}</p>
                    {/* Resposta em texto secundário */}
                    <p className="mt-1 text-xs leading-relaxed text-[#5D6475]">{item.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
