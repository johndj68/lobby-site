'use client'

import Link from 'next/link'
import { ChevronRight, Globe, Building2, FileEdit, Calendar } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import EditorChrome from '@/components/vendor/editor/EditorChrome'
import { formatDateTimeBR } from '@/lib/marketplace'

interface Props {
  draft: { id: string; name: string | null; status: string; websiteUrl: string | null; createdAt: string; lastEditedAt: string }
  organizationName: string | null
  completion: { 1: boolean; 2: boolean; 3: boolean }
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho', submitted: 'Enviado', under_review: 'Em análise',
  changes_requested: 'Ajustes solicitados', approved: 'Aprovado', published: 'Publicado',
}

/** Etapa 1 do cadastro — a tela original (NovoAppClient) só sabe CRIAR um
 *  app novo, sem noção de "retomar" um já existente. Esta é a visão de
 *  retomada: mostra a origem e os metadados reais do app já criado, sem
 *  reabrir importação nem criar outro registro. */
export default function ComecarClient({ draft, organizationName, completion }: Props) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden" style={{ background: colors.backgroundAlt }}>
      <EditorChrome appId={draft.id} appName={draft.name || 'Aplicativo sem nome'} breadcrumbLabel="Começar" currentStep={1} completed={completion} />

      <div className="mx-auto w-full max-w-[900px] flex-1 px-4 py-8 sm:px-8">
        <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: colors.text, fontFamily: 'Space Grotesk, sans-serif' }}>
          {draft.name || 'Continue seu cadastro'}
        </h1>
        <p className="mt-1 text-sm" style={{ color: colors.textSecondary }}>
          Confira a origem do cadastro antes de seguir para o conteúdo do anúncio.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <InfoCard icon={Globe} label="Origem do cadastro" value={draft.websiteUrl || 'Cadastro manual'} />
          <InfoCard icon={Building2} label="Organização responsável" value={organizationName || 'Não identificada'} />
          <InfoCard icon={FileEdit} label="Situação atual" value={STATUS_LABEL[draft.status] ?? draft.status} />
          <InfoCard icon={Calendar} label="Última edição" value={formatDateTimeBR(draft.lastEditedAt)} />
        </div>

        <div className="mt-6 rounded-xl border p-4 text-xs" style={{ borderColor: colors.border, background: '#fff', color: colors.textSecondary }}>
          Este é o mesmo cadastro que você já começou — continuar não cria um novo aplicativo. Alterar a organização responsável só é possível pelo fluxo de convites da equipe.
        </div>

        <div className="mt-8 flex justify-end">
          <Link href={`/dashboard/meus-app/novo/${draft.id}/editar`}
            className="inline-flex items-center gap-1.5 rounded-lg px-6 py-2.5 text-sm font-semibold text-white" style={{ background: colors.primary }}>
            Continuar para produto e mídia <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}

function InfoCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: colors.border }}>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: colors.textSecondary }}>
        <Icon size={13} aria-hidden="true" /> {label}
      </div>
      <p className="truncate text-sm font-medium" style={{ color: colors.text }} title={value}>{value}</p>
    </div>
  )
}
