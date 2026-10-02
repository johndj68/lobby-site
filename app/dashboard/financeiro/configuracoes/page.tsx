import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, LifeBuoy } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import { colors } from '@/lib/design-tokens'

export const metadata: Metadata = { title: 'Configurações de recebimento | LOBBY', robots: { index: false, follow: false } }

export default async function FinanceiroConfiguracoesPage() {
  const supabase = await createServerSupabaseClient()
  const { user } = await requireClientSession(supabase)

  // Sempre o próprio usuário — nunca lê ?parceiro= (decisão do spec:
  // dado bancário nunca é "visualizado em nome de outro parceiro",
  // mesmo padrão de /dashboard/conta, que também é sempre a própria conta).
  const { data: profile } = await supabase
    .from('profiles')
    .select('payout_pix_key, payout_account_holder, payout_notes')
    .eq('id', user.id)
    .maybeSingle()

  const fields = [
    { label: 'Chave PIX',         value: profile?.payout_pix_key },
    { label: 'Titular da conta',  value: profile?.payout_account_holder },
    { label: 'Observações',       value: profile?.payout_notes },
  ]

  return (
    <div>
      <h2 className="mb-2 text-lg font-bold" style={{ color: colors.text }}>Configurações de recebimento</h2>
      <p className="mb-5 text-sm" style={{ color: colors.textSecondary }}>
        Dados usados pra receber seus repasses via PIX/TED.
      </p>

      <div className="mb-4 rounded-2xl border p-5" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
        <div className="flex flex-col gap-3">
          {fields.map(f => (
            <div key={f.label}>
              <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>{f.label}</p>
              <p className="text-sm" style={{ color: f.value ? colors.text : colors.textMuted }}>{f.value || 'Não cadastrado'}</p>
            </div>
          ))}
        </div>
        <Link
          href="/dashboard/conta"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold"
          style={{ color: colors.primary }}
        >
          Editar em Conta
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="rounded-2xl border p-5" style={{ borderColor: colors.border, background: colors.card }}>
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: colors.text }}>
          <LifeBuoy size={16} aria-hidden="true" />
          Dúvidas sobre repasse?
        </p>
        <p className="mb-3 text-sm" style={{ color: colors.textSecondary }}>
          Fale com o nosso time de suporte pra tirar dúvidas sobre prazos, valores ou dados de recebimento.
        </p>
        <Link href="/dashboard/suporte" className="text-sm font-semibold" style={{ color: colors.primary }}>
          Abrir suporte →
        </Link>
      </div>
    </div>
  )
}
