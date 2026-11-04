export interface DestinationDetail {
  configured: boolean
  payoutMethod: 'pix' | 'bank_transfer' | null
  accountHolder: string | null
  personType: 'pf' | 'pj' | null
  maskedDocument: string | null
  pixKeyType: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria' | null
  maskedPix: string | null
  bankName: string | null
  maskedBankAgency: string | null
  maskedBankAccount: string | null
  bankAccountType: 'corrente' | 'poupanca' | null
  updatedAt: string | null
  // Alteração solicitada, ainda não aprovada — sempre separada do destino
  // vigente acima. pendingRequestId null = nenhuma alteração pendente.
  pendingRequestId: string | null
  pendingMethod: 'pix' | 'bank_transfer' | null
  pendingAccountHolder: string | null
  pendingMaskedPix: string | null
  pendingBankName: string | null
  pendingMaskedBankAccount: string | null
  pendingCreatedAt: string | null
}

export interface HistoryEvent {
  action: 'created' | 'updated'
  description: string
  createdAt: string
  actorRole: 'equipe_lobby' | 'parceiro' | 'sistema'
}

export type SituacaoCadastro = 'nao_cadastrado' | 'incompleto' | 'cadastrado' | 'precisa_correcao' | 'aguardando_aprovacao'

export function resolveSituacao(d: DestinationDetail | null): SituacaoCadastro {
  if (d?.pendingRequestId) return 'aguardando_aprovacao'
  if (!d || !d.configured) return 'nao_cadastrado'
  if (!d.accountHolder) return 'incompleto'
  if (d.payoutMethod === 'pix' && (!d.pixKeyType || !d.maskedPix)) return 'incompleto'
  if (d.payoutMethod === 'bank_transfer' && (!d.bankName || !d.maskedBankAgency || !d.maskedBankAccount || !d.bankAccountType)) return 'incompleto'
  return 'cadastrado'
}

export const SITUACAO_LABEL: Record<SituacaoCadastro, string> = {
  nao_cadastrado: 'Não cadastrado',
  incompleto: 'Cadastro incompleto',
  cadastrado: 'Dados cadastrados',
  precisa_correcao: 'Precisa de correção',
  aguardando_aprovacao: 'Alteração em análise',
}
