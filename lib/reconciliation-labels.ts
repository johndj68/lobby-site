import type { ReconciliationOperationType, ReconciliationResultType, ReconciliationRunStatus } from '@/types'

export const OPERATION_TYPE_LABEL: Record<ReconciliationOperationType, string> = {
  creditos:    'Créditos',
  apps:        'Apps do marketplace',
  destaques:   'Destaques patrocinados',
  assinaturas: 'Assinaturas',
}

export const RESULT_TYPE_LABEL: Record<ReconciliationResultType, string> = {
  correspondente:                'Correspondente',
  diferenca_valor:               'Diferença de valor',
  diferenca_moeda:               'Diferença de moeda',
  diferenca_status:              'Diferença de status',
  sem_registro_local:            'Sem registro local',
  sem_correspondencia_provedor:  'Sem correspondência no provedor',
  possivel_duplicidade:          'Possível duplicidade',
  nao_verificavel:               'Não verificável',
}

// verde = correspondência confirmada · vermelho = divergência real ·
// amarelo = exige investigação (pode ter explicação legítima) · cinza = inconclusivo.
export const RESULT_TYPE_STYLE: Record<ReconciliationResultType, { color: string; bg: string }> = {
  correspondente:               { color: '#34D399', bg: 'rgba(16,185,129,0.12)' },
  diferenca_valor:              { color: '#F87171', bg: 'rgba(239,68,68,0.12)' },
  diferenca_moeda:              { color: '#F87171', bg: 'rgba(239,68,68,0.12)' },
  diferenca_status:             { color: '#F87171', bg: 'rgba(239,68,68,0.12)' },
  possivel_duplicidade:         { color: '#F87171', bg: 'rgba(239,68,68,0.12)' },
  sem_registro_local:           { color: '#FBBF24', bg: 'rgba(245,158,11,0.12)' },
  sem_correspondencia_provedor: { color: '#FBBF24', bg: 'rgba(245,158,11,0.12)' },
  nao_verificavel:              { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
}

export const RUN_STATUS_LABEL: Record<ReconciliationRunStatus, string> = {
  em_processamento:       'Em processamento',
  concluido:              'Concluído',
  concluido_parcialmente: 'Concluído parcialmente',
  falhou:                 'Falhou',
}
