/** Documentos reais de "Termos de Parceiros" e "condições comerciais" —
 *  checados no projeto inteiro: não existe nenhuma página/registro com
 *  esse conteúdo (só o termo geral de serviços da LOBBY em /sobre#termos,
 *  que é sobre outra coisa). app_review_acceptances já grava
 *  partner_terms_version/commercial_terms_version corretamente quando um
 *  aceite acontece — só falta o documento em si existir. Enquanto isso não
 *  muda, o envio fica bloqueado de propósito (não fabricamos contrato) e a
 *  UI explica exatamente por quê, em vez de esconder um checkbox morto.
 *  Trocar pra true assim que os documentos reais existirem em algum lugar
 *  linkável — nenhuma outra mudança de código é necessária. */
export const TERMS_DOCUMENTS_AVAILABLE = false

export interface Acceptances {
  authorized: boolean
  reviewed: boolean
  partnerTerms: boolean
  commercialTerms: boolean
}

export interface SubmitGate {
  contentBlockers: number
  acceptancesRemaining: number
  termsAvailable: boolean
  canEdit: boolean
  uploadInFlight: boolean
  canSubmit: boolean
  /** Motivo principal a mostrar perto do botão quando canSubmit é falso —
   *  nunca deixa o botão cinza sem explicação. */
  blockingReason: string | null
}

export function computeSubmitGate(opts: {
  contentBlockers: number
  acceptances: Acceptances
  canEdit: boolean
  uploadInFlight: boolean
}): SubmitGate {
  const acceptancesRemaining = Object.values(opts.acceptances).filter(v => !v).length
  const termsAvailable = TERMS_DOCUMENTS_AVAILABLE

  let blockingReason: string | null = null
  if (!opts.canEdit) blockingReason = 'Você não tem permissão para enviar este aplicativo para análise.'
  else if (opts.uploadInFlight) blockingReason = 'Aguarde o upload em andamento terminar.'
  else if (opts.contentBlockers > 0) blockingReason = `Faltam ${opts.contentBlockers} informaç${opts.contentBlockers === 1 ? 'ão obrigatória' : 'ões obrigatórias'}.`
  else if (!termsAvailable) blockingReason = 'Os termos de parceiro ainda não estão disponíveis para aceite — envio temporariamente bloqueado.'
  else if (acceptancesRemaining > 0) blockingReason = `Faltam ${acceptancesRemaining} confirmaç${acceptancesRemaining === 1 ? 'ão' : 'ões'}.`

  return {
    contentBlockers: opts.contentBlockers,
    acceptancesRemaining,
    termsAvailable,
    canEdit: opts.canEdit,
    uploadInFlight: opts.uploadInFlight,
    canSubmit: opts.canEdit && !opts.uploadInFlight && opts.contentBlockers === 0 && termsAvailable && acceptancesRemaining === 0,
    blockingReason,
  }
}
