'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Coins, Loader2, CheckCircle2, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatCredits } from '@/lib/credits'
import type { ClientProject } from '@/types'

/* Props do componente:
 * - project: dados do projeto do cliente (inclui custo em créditos e status de pagamento)
 * - onPaid:  callback chamado com os dados atualizados do projeto após pagamento */
interface Props {
  project: ClientProject
  onPaid:  (updated: ClientProject) => void
}

/**
 * Card "usar créditos neste projeto" — só renderiza quando o líder marcou
 * allow_credit_payment. Débito é feito pela função redeem_credits_for_project
 * (atômica: verifica saldo, debita, marca credit_payment_status='pago');
 * o realtime subscription do ProjectDetailClient já escuta UPDATE em
 * client_projects, então essa mudança aparece sozinha assim que confirmada.
 */
export default function CreditPaymentCard({ project, onPaid }: Props) {
  // Saldo atual de créditos do cliente — null enquanto carrega da API
  const [balance, setBalance] = useState<number | null>(null)

  // Indica se o pagamento está sendo processado (desabilita botão)
  const [paying, setPaying]   = useState(false)

  // Mensagem de erro exibida em caso de falha no pagamento
  const [error, setError]     = useState('')

  /**
   * Busca o saldo de créditos do cliente na tabela `client_credit_wallets`.
   * Executado uma vez ao montar o componente (depende de project.client_id).
   * Se a carteira não existir, usa 0 como saldo padrão.
   */
  useEffect(() => {
    createClient()
      .from('client_credit_wallets')
      .select('balance')
      .eq('user_id', project.client_id)
      .maybeSingle()
      .then(({ data }) => setBalance(data?.balance ?? 0))
  }, [project.client_id])

  // Custo do projeto em créditos (0 se não definido)
  const cost = project.credit_cost ?? 0

  // true se o projeto já foi pago com créditos
  const isPaid = project.credit_payment_status === 'pago'

  // true se o saldo é suficiente para pagar o projeto
  const hasEnough = balance != null && balance >= cost

  /**
   * Chama a função RPC `redeem_credits_for_project` que de forma atômica:
   *  1. Verifica se o saldo é suficiente
   *  2. Debita os créditos da carteira
   *  3. Marca credit_payment_status = 'pago' no projeto
   * Após sucesso, atualiza o saldo localmente e notifica o pai via onPaid().
   */
  const handlePay = async () => {
    setPaying(true)
    setError('')
    try {
      const supabase = createClient()
      const { data, error: err } = await supabase.rpc('redeem_credits_for_project', { p_project_id: project.id })
      if (err) throw err

      // Notifica o componente pai com os dados atualizados do projeto
      onPaid(data as ClientProject)

      // Atualiza o saldo exibido localmente sem necessitar de nova consulta
      setBalance(prev => prev != null ? prev - cost : prev)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível pagar com créditos.')
    } finally {
      setPaying(false)
    }
  }

  return (
    /* Seção semântica com aria-label para leitores de tela */
    <section aria-label="Pagamento com créditos">
      {/* Card com borda e fundo amarelo-claro para destacar a opção de créditos */}
      <div className="rounded-2xl border border-[#FBBF24]/25 bg-[#FFFBEB] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

          {/* Informações do custo: ícone, título, custo e saldo disponível */}
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FBBF24]/15">
              <Coins size={18} className="text-[#D97706]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#0B1020]">Usar créditos neste projeto</p>
              {/* Exibe "..." enquanto o saldo ainda está carregando */}
              <p className="mt-0.5 text-xs text-[#92400E]">
                Custo: {formatCredits(cost)} · Saldo disponível: {balance != null ? formatCredits(balance) : '...'}
              </p>
            </div>
          </div>

          {/* Renderização condicional das ações com base no estado do pagamento */}
          {isPaid ? (
            /* Projeto já pago com créditos — exibe badge de confirmação */
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#10B981]/12 px-4 py-2.5 text-xs font-bold text-[#10B981]">
              <CheckCircle2 size={14} aria-hidden="true" />
              Pago com créditos
            </span>
          ) : hasEnough ? (
            /* Saldo suficiente — exibe botão de pagamento */
            <button
              type="button"
              onClick={handlePay}
              disabled={paying}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-4 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 disabled:opacity-60"
            >
              {paying ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Wallet size={14} aria-hidden="true" />}
              {paying ? 'Processando...' : 'Usar créditos para pagar'}
            </button>
          ) : (
            /* Saldo insuficiente — exibe mensagem e link para comprar mais créditos */
            <div className="text-right text-xs text-[#92400E]">
              <p className="font-semibold">Você não possui créditos suficientes para pagar este projeto.</p>
              <Link href="/dashboard/creditos" className="font-bold text-[#005BFF] hover:underline">Comprar mais créditos</Link>
            </div>
          )}
        </div>

        {/* Mensagem de erro exibida abaixo do card em caso de falha no pagamento */}
        {error && <p role="alert" className="mt-3 text-xs font-medium text-red-500">{error}</p>}
      </div>
    </section>
  )
}
