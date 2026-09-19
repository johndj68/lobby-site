'use client'
// Diretiva "use client": este módulo é um Client Component e executa no navegador.
// Responsável por renderizar o dashboard de relatórios administrativos:
//  - Grade de cards de métricas (visão geral)
//  - Gráfico de barras com distribuição dos projetos por status
//  - Cards de resumo de créditos (emitidos × gastos)

import {
  FolderKanban, Users, CheckCircle2,
  BarChart3, Coins, Download, MessageCircle, AlertCircle,
} from 'lucide-react'

/* ============================================================
 * Tipos de dados das estatísticas recebidas via props
 * ============================================================ */

// Estatísticas agregadas dos projetos cadastrados no sistema
interface ProjectStats {
  total: number            // Total de projetos (todas as situações)
  active: number           // Projetos atualmente em andamento
  completed: number        // Projetos finalizados com entrega concluída
  pending_approval: number // Projetos aguardando aprovação do cliente
}

// Estatísticas do conjunto de clientes registrados na plataforma
interface ClientStats {
  total: number               // Quantidade total de clientes no banco
  with_active_project: number // Clientes que possuem ao menos um projeto ativo
}

// Resumo financeiro de créditos da plataforma
interface CreditStats {
  total_issued: number // Total de créditos emitidos para todos os clientes
  total_spent:  number // Total de créditos já consumidos / utilizados
}

// Dados sobre leads captados por meio de downloads de materiais
interface LeadStats {
  total:      number // Leads acumulados desde o início da operação
  this_month: number // Leads captados somente no mês corrente
}

// Estatísticas das mensagens trocadas dentro do sistema
interface MessageStats {
  total:  number // Total de mensagens registradas
  unread: number // Mensagens ainda não lidas pelo time técnico
}

/* ============================================================
 * Props do componente RelatoriosClient
 * ============================================================ */

// Agrupa todas as estatísticas necessárias para montar o dashboard.
// Os dados são buscados pelo Server Component pai e passados como props.
interface Props {
  projects: ProjectStats // Dados sobre projetos
  clients:  ClientStats  // Dados sobre clientes
  credits:  CreditStats  // Dados sobre créditos
  leads:    LeadStats    // Dados sobre leads de download
  messages: MessageStats // Dados sobre mensagens
}

/* ============================================================
 * Configuração dos cards de métricas
 * ============================================================ */

/**
 * METRICS — factory que gera a lista de configurações para os cards de métricas.
 * Recebe as props e retorna um array onde cada item define:
 *  - label:  rótulo descritivo do indicador
 *  - value:  valor numérico principal
 *  - sub:    subtexto de contexto complementar
 *  - icon:   componente de ícone do Lucide React
 *  - color:  cor de destaque do ícone (hex)
 *  - bg:     cor de fundo semitransparente do ícone (rgba)
 */
const METRICS = (p: Props) => [
  {
    label: 'Projetos ativos',
    value: p.projects.active,
    sub: `${p.projects.total} total`, // Subtexto: total geral de projetos como referência
    icon: FolderKanban,
    color: '#005BFF',                 // Azul primário da identidade visual
    bg: 'rgba(0,91,255,0.10)',        // Fundo semitransparente do ícone
  },
  {
    label: 'Projetos concluídos',
    value: p.projects.completed,
    // Calcula o percentual de conclusão; Math.max(total, 1) evita divisão por zero
    sub: `${Math.round((p.projects.completed / Math.max(p.projects.total, 1)) * 100)}% conclusão`,
    icon: CheckCircle2,
    color: '#10B981',          // Verde — símbolo de conclusão / sucesso
    bg: 'rgba(16,185,129,0.10)',
  },
  {
    label: 'Aguardando aprovação',
    value: p.projects.pending_approval,
    sub: 'do cliente', // Indica que a ação necessária é do lado do cliente
    icon: AlertCircle,
    color: '#F59E0B',          // Amarelo — sinaliza atenção / pendência
    bg: 'rgba(245,158,11,0.10)',
  },
  {
    label: 'Clientes ativos',
    value: p.clients.with_active_project,
    sub: `${p.clients.total} cadastrados`, // Total de clientes na base para comparação
    icon: Users,
    color: '#7B2CFF',          // Roxo — cor do módulo de clientes
    bg: 'rgba(123,44,255,0.10)',
  },
  {
    label: 'Créditos emitidos',
    value: p.credits.total_issued,
    sub: `${p.credits.total_spent} gastos`, // Créditos já consumidos como referência
    icon: Coins,
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.10)',
  },
  {
    label: 'Leads de downloads',
    value: p.leads.total,
    sub: `+${p.leads.this_month} este mês`, // Variação positiva do mês corrente
    icon: Download,
    color: '#00A3FF',
    bg: 'rgba(0,163,255,0.10)',
  },
  {
    label: 'Mensagens no sistema',
    value: p.messages.total,
    sub: `${p.messages.unread} não lidas`, // Mensagens pendentes de leitura pelo time
    icon: MessageCircle,
    color: '#005BFF',
    bg: 'rgba(0,91,255,0.10)',
  },
]

/* ============================================================
 * Componente principal
 * ============================================================ */

/**
 * RelatoriosClient — painel completo de relatórios administrativos.
 *
 * Recebe dados pré-buscados pelo Server Component pai e não realiza
 * requisições próprias ao banco de dados (sem useEffect / fetch no cliente).
 */
export default function RelatoriosClient(props: Props) {
  // Instancia a lista de métricas injetando os valores das props
  const metrics = METRICS(props)

  return (
    <div className="space-y-8">
      {/* Métricas principais */}
      <section aria-label="Métricas do sistema">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-white/40">Visão geral</h2>
        {/* Grade responsiva: 1 coluna em mobile → até 4 colunas em telas largas */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {metrics.map(m => (
            /* Card individual: ícone colorido + rótulo + valor principal + subtexto */
            <div key={m.label} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              {/* Ícone dentro de bloco com fundo semitransparente na cor da categoria */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: m.bg }}>
                <m.icon size={18} style={{ color: m.color }} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                {/* Rótulo descritivo do indicador */}
                <p className="text-xs text-white/40">{m.label}</p>
                {/* Valor numérico principal em destaque */}
                <p className="text-2xl font-bold text-white">{m.value}</p>
                {/* Informação secundária de contexto */}
                <p className="text-[10px] text-white/30">{m.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Distribuição de projetos */}
      <section aria-label="Distribuição de projetos">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-white/40">Projetos</h2>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          {/* Cabeçalho do gráfico de barras */}
          <div className="flex items-center gap-3 mb-4">
            <BarChart3 size={16} className="text-[#005BFF]" aria-hidden="true" />
            <span className="text-sm font-bold text-white">Distribuição por status</span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Ativos',               value: props.projects.active,           color: '#005BFF' },
              { label: 'Concluídos',            value: props.projects.completed,        color: '#10B981' },
              { label: 'Aguardando aprovação',  value: props.projects.pending_approval, color: '#F59E0B' },
              { label: 'Outros',
                // "Outros" agrupa projetos em status que não se encaixam nas 3 categorias acima
                value: props.projects.total - props.projects.active - props.projects.completed - props.projects.pending_approval,
                color: '#6B7280' },
            ].filter(r => r.value > 0).map(row => {
              // Percentual desta categoria em relação ao total (zero quando não há projetos)
              const pct = props.projects.total > 0 ? Math.round((row.value / props.projects.total) * 100) : 0
              return (
                <div key={row.label} className="space-y-1">
                  {/* Linha com rótulo à esquerda e contagem + percentual à direita */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/60">{row.label}</span>
                    <span className="font-bold text-white">{row.value} <span className="text-white/30">({pct}%)</span></span>
                  </div>
                  {/* Barra de progresso: trilha neutra + preenchimento na cor da categoria */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: row.color }} />
                  </div>
                </div>
              )
            })}
          </div>
          {/* Rodapé: total absoluto de projetos no sistema */}
          <p className="mt-4 text-xs text-white/30">{props.projects.total} projetos no total</p>
        </div>
      </section>

      {/* Créditos */}
      <section aria-label="Créditos">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-white/40">Créditos</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Card: total de créditos emitidos para os clientes */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs text-white/40">Total emitido</p>
            <p className="mt-1 text-3xl font-bold text-white">{props.credits.total_issued}</p>
            <p className="mt-1 text-xs text-white/30">créditos</p>
          </div>
          {/* Card: total de créditos gastos com percentual de aproveitamento */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-xs text-white/40">Total gasto</p>
            <p className="mt-1 text-3xl font-bold text-white">{props.credits.total_spent}</p>
            {/* Percentual utilizado: gastos ÷ emitidos; guarda contra divisão por zero */}
            <p className="mt-1 text-xs text-white/30">créditos · {props.credits.total_issued > 0 ? Math.round((props.credits.total_spent / props.credits.total_issued) * 100) : 0}% utilizado</p>
          </div>
        </div>
      </section>
    </div>
  )
}
