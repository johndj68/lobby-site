import { Inbox, UserPlus, FolderKanban, FileText, Activity } from 'lucide-react'
import type { Contact } from '@/app/admin/solicitacoes/page'

/**
 * Representa um lead que baixou um material no site.
 * Estrutura simplificada — não inclui mensagem ou status como Contact,
 * apenas os dados necessários para exibir a atividade na timeline.
 */
export interface ActivityLead {
  id:            string
  name:          string
  company?:      string
  interest_area?: string
  created_at:    string
}

/**
 * Tipos de evento que podem aparecer na timeline de atividades do painel admin.
 * Cada kind tem ícone, cor e label próprios (veja ACTIVITY_KIND_CONFIG).
 */
export type ActivityKind = 'lead' | 'solicitacao' | 'projeto' | 'arquivo' | 'sistema'

/**
 * Representa um evento normalizado na timeline de atividades.
 * Unifica contatos e leads em uma estrutura comum para facilitar
 * a renderização e o agrupamento por data/tipo.
 */
export interface ActivityItem {
  id:          string
  kind:        ActivityKind
  title:       string
  description: string
  category?:   string
  createdAt:   string
}

// Rótulos legíveis por tipo de atividade — usados nos filtros do drawer
export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  lead:        'Leads',
  solicitacao: 'Solicitações',
  projeto:     'Projetos',
  arquivo:     'Arquivos',
  sistema:     'Sistema',
}

/**
 * Configuração visual e de ação por tipo de atividade.
 * Define o ícone Lucide, cor do ícone, cor de fundo e label do botão
 * de ação no drawer de detalhes.
 */
export const ACTIVITY_KIND_CONFIG: Record<ActivityKind, { icon: React.ElementType; color: string; bg: string; actionLabel: string }> = {
  solicitacao: { icon: Inbox,       color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  actionLabel: 'Ver solicitação' },
  lead:        { icon: UserPlus,    color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', actionLabel: 'Ver lead' },
  projeto:     { icon: FolderKanban,color: '#00A3FF', bg: 'rgba(0,163,255,0.12)',   actionLabel: 'Ver projeto' },
  arquivo:     { icon: FileText,    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  actionLabel: 'Ver arquivo' },
  sistema:     { icon: Activity,    color: '#64748B', bg: 'rgba(100,116,139,0.12)', actionLabel: 'Ver detalhes' },
}

/**
 * Constrói a lista unificada de atividades a partir de duas fontes:
 * - contacts: solicitações recebidas via formulário de contato
 * - leads: downloads de materiais registrados pelo site
 *
 * O resultado é ordenado do mais recente para o mais antigo,
 * pronto para ser fatiado e exibido nos cards/drawers de atividade.
 */
export function buildActivityItems(contacts: Contact[], leads: ActivityLead[]): ActivityItem[] {
  // Mapeia cada contato para um ActivityItem do tipo "solicitacao"
  const fromContacts: ActivityItem[] = contacts.map(c => ({
    id:          `solicitacao-${c.id}`,
    kind:        'solicitacao',
    title:       `Novo lead recebido: ${c.name}`,
    description: 'Cliente deixou contato através de material ou formulário do site.',
    category:    c.interest_area,
    createdAt:   c.created_at,
  }))

  // Mapeia cada lead de material para um ActivityItem do tipo "lead"
  const fromLeads: ActivityItem[] = leads.map(l => ({
    id:          `lead-${l.id}`,
    kind:        'lead',
    title:       `Lead de material: ${l.name}`,
    description: 'Cliente baixou um material através do formulário do site.',
    category:    l.interest_area,
    createdAt:   l.created_at,
  }))

  // Mescla as duas fontes e ordena por data decrescente (mais recente primeiro)
  return [...fromContacts, ...fromLeads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/**
 * Bucket de data para agrupamento visual na timeline.
 * Usado no ActivitiesDrawer para separar atividades por período.
 */
export type DateBucket = 'Hoje' | 'Ontem' | 'Esta semana' | 'Este mês' | 'Mais antigas'

// Ordem de exibição dos buckets de data (do mais recente para o mais antigo)
export const DATE_BUCKET_ORDER: DateBucket[] = ['Hoje', 'Ontem', 'Esta semana', 'Este mês', 'Mais antigas']

/**
 * Classifica uma data em um bucket de período relativo ao momento atual.
 * Usa diferença em dias inteiros para simplicidade e consistência.
 */
export function getDateBucket(dateStr: string): DateBucket {
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diffDays <= 0) return 'Hoje'
  if (diffDays === 1) return 'Ontem'
  if (diffDays <= 7)  return 'Esta semana'
  if (diffDays <= 30) return 'Este mês'
  return 'Mais antigas'
}

/**
 * Identificadores dos períodos de filtro disponíveis no drawer de atividades.
 * 'todos' desativa o filtro temporal e exibe tudo.
 */
export type PeriodKey = 'hoje' | '7d' | '30d' | 'todos'

// Opções de período exibidas como botões de filtro no drawer
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'hoje',  label: 'Hoje' },
  { key: '7d',    label: '7 dias' },
  { key: '30d',   label: '30 dias' },
  { key: 'todos', label: 'Todos os períodos' },
]

/**
 * Retorna o timestamp (ms) de corte para o período selecionado.
 * Atividades com createdAt anterior ao cutoff são filtradas fora.
 * Retorna null para 'todos', indicando que nenhum filtro deve ser aplicado.
 */
export function getPeriodCutoff(period: PeriodKey): number | null {
  const now = Date.now()
  if (period === 'hoje')  return now - 24 * 3600 * 1000
  if (period === '7d')    return now - 7 * 86400000
  if (period === '30d')   return now - 30 * 86400000
  return null
}
