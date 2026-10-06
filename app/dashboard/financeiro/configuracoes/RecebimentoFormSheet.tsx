'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { colors } from '@/lib/design-tokens'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import type { DestinationDetail } from './types'

interface Props {
  open: boolean
  partnerId: string | null
  current: DestinationDetail | null
  onClose: () => void
  onSaved: () => void
}

type Step = 'form' | 'confirm'

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm'
const inputStyle = { borderColor: colors.border, color: colors.text }

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold" style={{ color: colors.text }}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px]" style={{ color: colors.textMuted }}>{hint}</p>}
    </div>
  )
}

export default function RecebimentoFormSheet({ open, partnerId, current, onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>('form')
  const [method, setMethod] = useState<'pix' | 'bank_transfer'>('pix')
  const [accountHolder, setAccountHolder] = useState('')
  const [personType, setPersonType] = useState<'pf' | 'pj' | ''>('')
  const [document, setDocument] = useState('')
  const [pixKeyType, setPixKeyType] = useState<'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'>('email')
  const [pixKey, setPixKey] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAgency, setBankAgency] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankAccountDigit, setBankAccountDigit] = useState('')
  const [bankAccountType, setBankAccountType] = useState<'corrente' | 'poupanca' | ''>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  const hasExisting = !!current?.configured

  useEffect(() => {
    if (!open) return
    setStep('form')
    setMethod(current?.payoutMethod ?? 'pix')
    setAccountHolder(current?.accountHolder ?? '')
    setPersonType((current?.personType as 'pf' | 'pj') ?? '')
    setDocument('') // sensível — nunca prefill de valor mascarado
    setPixKeyType((current?.pixKeyType as typeof pixKeyType) ?? 'email')
    setPixKey('')
    setBankName(current?.bankName ?? '')
    setBankAgency('')
    setBankAccount('')
    setBankAccountDigit('')
    setBankAccountType((current?.bankAccountType as 'corrente' | 'poupanca') ?? '')
    setNotes('')
    setError('')
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current])

  function validate(): string | null {
    if (!accountHolder.trim()) return 'Informe o nome do titular.'
    if (method === 'pix') {
      if (!pixKey.trim()) return 'Informe a chave Pix.'
    } else {
      if (!bankName.trim()) return 'Informe o banco.'
      if (!bankAgency.trim()) return 'Informe a agência.'
      if (!bankAccount.trim()) return 'Informe a conta.'
      if (!bankAccountType) return 'Informe o tipo de conta.'
    }
    return null
  }

  function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    const v = validate()
    if (v) { setError(v); return }
    setError('')
    setStep('confirm')
  }

  async function handleConfirm() {
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const { data, error: rpcError } = await supabase.rpc('update_partner_payout_destination', {
        p_partner_id: partnerId ?? (await supabase.auth.getUser()).data.user?.id,
        p_method: method,
        p_account_holder: accountHolder.trim(),
        p_person_type: personType || null,
        p_document: document.trim() || null,
        p_pix_key_type: method === 'pix' ? pixKeyType : null,
        p_pix_key: method === 'pix' ? pixKey.trim() : null,
        p_bank_name: method === 'bank_transfer' ? bankName.trim() : null,
        p_bank_agency: method === 'bank_transfer' ? bankAgency.trim() : null,
        p_bank_account: method === 'bank_transfer' ? bankAccount.trim() : null,
        p_bank_account_digit: method === 'bank_transfer' ? (bankAccountDigit.trim() || null) : null,
        p_bank_account_type: method === 'bank_transfer' ? bankAccountType : null,
        p_notes: notes.trim() || null,
        p_expected_updated_at: current?.updatedAt ?? null,
      })
      if (rpcError) {
        const msg = rpcError.message || ''
        if (msg.includes('atualizados por outra sessão')) {
          setError('Os dados foram atualizados por outra pessoa enquanto você editava — recarregue e confira antes de tentar de novo.')
        } else if (msg.includes('aguardando aprovação')) {
          setError('Já existe uma alteração aguardando aprovação — cancele-a antes de enviar uma nova, ou aguarde a revisão da equipe.')
        } else if (msg.includes('JWT') || msg.includes('não autenticado') || msg.toLowerCase().includes('not authenticated')) {
          setError('Sua sessão expirou — recarregue a página e faça login de novo.')
        } else {
          setError(msg || 'Não foi possível salvar. Tente novamente.')
        }
        setStep('form')
        return
      }
      if (!data) throw new Error('sem resposta')
      toast.success('Alteração enviada para análise — a equipe LOBBY vai revisar antes de valer.')
      onSaved()
    } catch {
      setError('Não foi possível salvar. Tente novamente.')
      setStep('form')
    } finally {
      setSaving(false)
    }
  }

  function requestClose() {
    if (dirty && !saving) {
      if (!window.confirm('Você tem alterações não salvas. Sair mesmo assim?')) return
    }
    onClose()
  }

  const markDirty = () => setDirty(true)

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) requestClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{hasExisting ? 'Editar dados de recebimento' : 'Cadastrar recebimento'}</SheetTitle>
          <SheetDescription>Usado só pela equipe LOBBY para registrar seus repasses — não processa pagamento automático.</SheetDescription>
        </SheetHeader>

        {step === 'form' && (
          <form onSubmit={handleContinue} className="flex flex-col gap-4 px-4 pb-6">
            <Field label="Método">
              <div className="flex gap-2">
                {(['pix', 'bank_transfer'] as const).map(m => (
                  <button key={m} type="button" onClick={() => { setMethod(m); markDirty() }}
                    className="flex-1 rounded-lg border py-2 text-sm font-semibold"
                    style={method === m ? { borderColor: colors.primary, color: colors.primary, background: `${colors.primary}0D` } : { borderColor: colors.border, color: colors.textSecondary }}>
                    {m === 'pix' ? 'Pix' : 'Transferência bancária'}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Titular">
              <input value={accountHolder} onChange={e => { setAccountHolder(e.target.value); markDirty() }} placeholder="Nome do titular da chave/conta" className={inputCls} style={inputStyle} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de pessoa (opcional)">
                <select value={personType} onChange={e => { setPersonType(e.target.value as typeof personType); markDirty() }} className={inputCls} style={inputStyle}>
                  <option value="">Não informar</option>
                  <option value="pf">Pessoa física</option>
                  <option value="pj">Pessoa jurídica</option>
                </select>
              </Field>
              <Field label="Documento (opcional)" hint={document === '' && current?.maskedDocument ? `Atual: ${current.maskedDocument} — digite de novo pra alterar` : undefined}>
                <input value={document} onChange={e => { setDocument(e.target.value); markDirty() }} placeholder="CPF ou CNPJ" className={inputCls} style={inputStyle} />
              </Field>
            </div>

            {method === 'pix' ? (
              <>
                <Field label="Tipo de chave">
                  <select value={pixKeyType} onChange={e => { setPixKeyType(e.target.value as typeof pixKeyType); markDirty() }} className={inputCls} style={inputStyle}>
                    <option value="email">E-mail</option>
                    <option value="telefone">Telefone</option>
                    <option value="cpf">CPF</option>
                    <option value="cnpj">CNPJ</option>
                    <option value="aleatoria">Chave aleatória</option>
                  </select>
                </Field>
                <Field label="Chave Pix" hint={current?.maskedPix ? `Atual: ${current.maskedPix} — digite a chave completa pra alterar` : undefined}>
                  <input value={pixKey} onChange={e => { setPixKey(e.target.value); markDirty() }} placeholder="Chave Pix completa" className={inputCls} style={inputStyle} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Banco">
                  <input value={bankName} onChange={e => { setBankName(e.target.value); markDirty() }} placeholder="Nome do banco" className={inputCls} style={inputStyle} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Agência" hint={current?.maskedBankAgency ? `Atual: ${current.maskedBankAgency}` : undefined}>
                    <input value={bankAgency} onChange={e => { setBankAgency(e.target.value); markDirty() }} className={inputCls} style={inputStyle} />
                  </Field>
                  <Field label="Tipo de conta">
                    <select value={bankAccountType} onChange={e => { setBankAccountType(e.target.value as typeof bankAccountType); markDirty() }} className={inputCls} style={inputStyle}>
                      <option value="">Selecione</option>
                      <option value="corrente">Conta corrente</option>
                      <option value="poupanca">Conta poupança</option>
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Conta" hint={current?.maskedBankAccount ? `Atual: ${current.maskedBankAccount}` : undefined}>
                    <input value={bankAccount} onChange={e => { setBankAccount(e.target.value); markDirty() }} className={inputCls} style={inputStyle} />
                  </Field>
                  <Field label="Dígito (opcional)">
                    <input value={bankAccountDigit} onChange={e => { setBankAccountDigit(e.target.value); markDirty() }} maxLength={2} className={inputCls} style={inputStyle} />
                  </Field>
                </div>
              </>
            )}

            <Field label="Instrução adicional (opcional)">
              <textarea rows={2} value={notes} onChange={e => { setNotes(e.target.value); markDirty() }} placeholder="Ex: processar só após o dia 5" className={inputCls} style={inputStyle} />
            </Field>
            <p className="text-[11px]" style={{ color: colors.textMuted }}>Não solicitamos senha, token bancário ou número de cartão — nunca informe esses dados aqui.</p>

            {error && <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{error}</p>}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={requestClose} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold" style={{ borderColor: colors.border, color: colors.text }}>Cancelar</button>
              <button type="submit" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white" style={{ background: colors.primary }}>
                Continuar <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </form>
        )}

        {step === 'confirm' && (
          <div className="flex flex-col gap-4 px-4 pb-6">
            <div className="rounded-xl border p-4" style={{ borderColor: colors.border, background: colors.backgroundAlt }}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.textMuted }}>Destino atual</p>
              {hasExisting ? (
                <p className="text-sm" style={{ color: colors.text }}>
                  {current?.payoutMethod === 'pix' ? `Pix (${current.maskedPix ?? '—'})` : `${current?.bankName ?? '—'} — ${current?.maskedBankAccount ?? '—'}`}
                </p>
              ) : (
                <p className="text-sm" style={{ color: colors.textMuted }}>Nenhum cadastro anterior.</p>
              )}
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: colors.primary, background: `${colors.primary}0D` }}>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: colors.primary }}>Destino proposto</p>
              <p className="text-sm" style={{ color: colors.text }}>
                {method === 'pix' ? `Pix — ${accountHolder}` : `${bankName} — ${accountHolder}`}
              </p>
            </div>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              Esta alteração precisa ser aprovada pela equipe LOBBY antes de valer — o destino atual continua sendo usado nos repasses até lá. Repasses já enviados nunca são alterados retroativamente, mesmo depois da aprovação.
            </p>

            {error && <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{error}</p>}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setStep('form')} disabled={saving} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-60" style={{ borderColor: colors.border, color: colors.text }}>Voltar</button>
              <button type="button" onClick={handleConfirm} disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: colors.primary }}>
                {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                {saving ? 'Enviando…' : 'Enviar para análise'}
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
