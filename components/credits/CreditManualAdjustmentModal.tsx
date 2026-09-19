'use client'

import { useState } from 'react'
import { X, Search, Loader2, Plus, Minus, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase'
import { formatCredits } from '@/lib/credits'

/* Tipo retornado pela busca de cliente por e-mail */
interface FoundClient {
  id:        string
  full_name: string | null
  email:     string | null
}

/* Props do componente:
 * - open:          controla visibilidade do modal
 * - onOpenChange:  callback para o Dialog gerenciar abertura/fechamento
 * - presetClient:  cliente pré-selecionado (ex: clicou em uma linha da tabela)
 *                  quando fornecido, pula a etapa de busca por e-mail
 * - onAdjusted:    callback chamado após o ajuste ser aplicado com sucesso */
interface Props {
  open:          boolean
  onOpenChange:  (open: boolean) => void
  /** Se aberto a partir de uma linha da tabela de carteiras, já vem
   *  preenchido — pula a busca por e-mail. */
  presetClient?: FoundClient | null
  onAdjusted:    () => void
}

/**
 * Ajuste manual de crédito — sempre exige justificativa (validado aqui E
 * dentro da função admin_adjust_credits, que também recusa qualquer
 * chamada de quem não for líder). "Ajustes manuais ficam registrados no
 * histórico de auditoria" porque toda chamada grava uma linha em
 * credit_transactions com created_by = auth.uid() do líder.
 */
export default function CreditManualAdjustmentModal({ open, onOpenChange, presetClient, onAdjusted }: Props) {
  /* Estados de busca de cliente */
  const [email, setEmail]         = useState('')        // Campo de e-mail para busca
  const [searching, setSearching] = useState(false)     // Busca em andamento
  const [found, setFound]         = useState<FoundClient | null>(presetClient ?? null) // Cliente encontrado/selecionado
  const [searchError, setSearchError] = useState('')    // Erro retornado pela busca

  /* Estados do formulário de ajuste */
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit') // Adicionar ou remover créditos
  const [amount, setAmount]       = useState('')        // Quantidade de créditos (inteiro positivo)
  const [reason, setReason]       = useState('')        // Justificativa obrigatória para auditoria
  const [saving, setSaving]       = useState(false)     // Requisição ao banco em andamento
  const [error, setError]         = useState('')        // Erro de validação ou da função RPC
  const [done, setDone]           = useState(false)     // Ajuste concluído com sucesso

  /**
   * Limpa todos os estados do formulário para o valor inicial.
   * Mantém presetClient se ele foi passado pelo componente pai.
   */
  const reset = () => {
    setEmail(''); setFound(presetClient ?? null); setSearchError('')
    setDirection('credit'); setAmount(''); setReason(''); setError(''); setDone(false)
  }

  /* Fecha o modal e reseta o formulário */
  const handleClose = () => { reset(); onOpenChange(false) }

  /**
   * Busca cliente por e-mail na tabela `profiles`.
   * Filtra apenas usuários com role='client' para evitar selecionar admins.
   * Suporta submissão via Enter além do botão de busca.
   */
  const handleSearch = async () => {
    if (!email.trim()) return
    setSearching(true)
    setSearchError('')
    setFound(null)
    try {
      const supabase = createClient()
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('email', email.trim().toLowerCase()) // Normaliza para lowercase antes de comparar
        .eq('role', 'client')                    // Só busca clientes, não admins/líderes
        .maybeSingle()
      if (err) throw err
      if (!data) { setSearchError('Nenhum cliente encontrado com esse e-mail.'); return }
      setFound(data)
    } catch {
      setSearchError('Erro ao buscar cliente. Tente novamente.')
    } finally {
      setSearching(false)
    }
  }

  /**
   * Valida os dados e chama a função RPC `admin_adjust_credits` no banco.
   * Validações:
   *  1. Cliente selecionado?
   *  2. Quantidade é um inteiro positivo?
   *  3. Justificativa preenchida?
   * A função RPC garante no banco que apenas o líder pode executar o ajuste.
   * Após sucesso, chama onAdjusted() para atualizar a lista no componente pai.
   */
  const handleSubmit = async () => {
    if (!found) { setError('Selecione um cliente.'); return }
    const amountNum = Number(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0 || !Number.isInteger(amountNum)) {
      setError('Informe uma quantidade de créditos válida (número inteiro maior que zero).')
      return
    }
    if (!reason.trim()) { setError('Justificativa obrigatória para ajuste manual.'); return }

    setSaving(true)
    setError('')
    try {
      const supabase = createClient()

      // Chama a função admin_adjust_credits — ela verifica permissão de líder
      // e registra a transação em credit_transactions para auditoria
      const { error: err } = await supabase.rpc('admin_adjust_credits', {
        p_user_id:   found.id,
        p_amount:    amountNum,
        p_direction: direction, // 'credit' = adicionar | 'debit' = remover
        p_reason:    reason.trim(),
      })
      if (err) throw err

      setDone(true)
      onAdjusted() // Notifica o pai para atualizar a listagem de carteiras
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aplicar o ajuste.')
    } finally {
      setSaving(false)
    }
  }

  return (
    /* Bloqueia fechamento durante o salvamento para evitar estado inconsistente */
    <Dialog open={open} onOpenChange={(next) => !saving && (next ? onOpenChange(true) : handleClose())}>
      <DialogContent showCloseButton={false} className="max-w-md rounded-2xl border border-white/[0.09] bg-[#0D1428] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.50)]">
        {/* Cabeçalho: título e botão de fechar */}
        <div className="mb-4 flex items-center justify-between">
          <DialogTitle className="text-lg font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Ajuste manual de créditos
          </DialogTitle>
          <button type="button" onClick={handleClose} disabled={saving} className="text-white/40 hover:text-white transition-colors" aria-label="Fechar">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Tela de sucesso — exibida após o ajuste ser aplicado */}
        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#10B981]/15">
              <ShieldCheck size={22} className="text-[#34D399]" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-white">Ajuste aplicado com sucesso.</p>
            {/* Confirma que a transação foi registrada para auditoria */}
            <p className="mt-1 text-xs text-white/40">Registrado no histórico de auditoria de {found?.full_name || found?.email}.</p>
            <button type="button" onClick={handleClose}
              className="mt-5 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] px-5 py-2.5 text-sm font-bold text-white">
              Fechar
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Seção de busca — omitida quando o cliente já vem pré-selecionado (presetClient) */}
            {!presetClient && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="adjust-email">Cliente (e-mail)</label>
                <div className="flex gap-2">
                  <input
                    id="adjust-email"
                    type="email"
                    placeholder="cliente@empresa.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    // Enter aciona a busca sem submeter o formulário
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                    className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50"
                  />
                  {/* Botão de busca — exibe spinner durante a requisição */}
                  <button type="button" onClick={handleSearch} disabled={searching}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white/[0.08] px-3 text-xs font-semibold text-white/70 hover:bg-white/[0.14] disabled:opacity-50">
                    {searching ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Search size={13} aria-hidden="true" />}
                  </button>
                </div>
                {/* Erro da busca — ex: e-mail não encontrado */}
                {searchError && <p role="alert" className="mt-1.5 text-xs text-red-400">{searchError}</p>}
                {/* Confirmação visual do cliente encontrado */}
                {found && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#34D399]">
                    <ShieldCheck size={12} aria-hidden="true" />
                    {found.full_name || found.email}
                  </p>
                )}
              </div>
            )}

            {/* Seleção do tipo de ajuste: adicionar (+) ou remover (-) créditos */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/60">Tipo de ajuste</label>
              <div className="grid grid-cols-2 gap-2">
                {/* Botão "Adicionar" — verde quando selecionado */}
                <button type="button" onClick={() => setDirection('credit')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-bold transition-all ${
                    direction === 'credit' ? 'border-[#10B981]/50 bg-[#10B981]/10 text-[#34D399]' : 'border-white/[0.08] bg-white/[0.03] text-white/50'
                  }`}>
                  <Plus size={13} aria-hidden="true" />Adicionar
                </button>
                {/* Botão "Remover" — vermelho quando selecionado */}
                <button type="button" onClick={() => setDirection('debit')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-bold transition-all ${
                    direction === 'debit' ? 'border-red-500/50 bg-red-500/10 text-red-400' : 'border-white/[0.08] bg-white/[0.03] text-white/50'
                  }`}>
                  <Minus size={13} aria-hidden="true" />Remover
                </button>
              </div>
            </div>

            {/* Campo: Quantidade de créditos — aceita apenas dígitos */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="adjust-amount">Quantidade de créditos</label>
              <input
                id="adjust-amount"
                type="text"
                inputMode="numeric"
                placeholder="100"
                value={amount}
                // Remove qualquer caractere que não seja dígito para garantir inteiro positivo
                onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50"
              />
              {/* Preview da quantidade formatada enquanto o usuário digita */}
              {amount && <p className="mt-1 text-[11px] text-white/35">{formatCredits(Number(amount))}</p>}
            </div>

            {/* Campo: Justificativa — obrigatória para fins de auditoria */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-white/60" htmlFor="adjust-reason">
                Justificativa <span className="text-[#FBBF24]">*</span>
              </label>
              <textarea
                id="adjust-reason"
                rows={3}
                placeholder="Ex: Compensação por instabilidade no sistema em 10/07."
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-[#005BFF]/50"
              />
              {/* Lembrete de que o ajuste fica registrado em auditoria */}
              <p className="mt-1 text-[11px] text-white/35">Ajustes manuais ficam registrados no histórico de auditoria.</p>
            </div>

            {/* Mensagem de erro de validação ou da função RPC */}
            {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">{error}</p>}

            {/* Ações: cancelar ou confirmar ajuste */}
            <div className="flex gap-3 pt-1">
              {/* Cancelar — desabilitado durante o salvamento */}
              <button type="button" onClick={handleClose} disabled={saving}
                className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 text-sm font-semibold text-white/60 hover:bg-white/[0.08] hover:text-white disabled:opacity-50">
                Cancelar
              </button>
              {/* Confirmar — desabilitado se não há cliente selecionado ou durante salvamento */}
              <button type="button" onClick={handleSubmit} disabled={saving || !found}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#005BFF] to-[#7B2CFF] py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                {saving ? 'Aplicando...' : 'Confirmar ajuste'}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
