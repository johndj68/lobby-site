// Categorias disponíveis no portfólio e nos recursos.
// 'Todos' é usada apenas como filtro de UI — nunca persiste no banco.
export type Category = 'Software' | 'Automação' | 'Dados' | 'Cibersegurança' | 'Todos'

// Projeto do portfólio público (tabela projects).
// Exibido na landing page; não é um projeto de cliente.
export interface Project {
  id: string
  title: string
  description: string
  category: Omit<Category, 'Todos'>
  imageUrl: string
  slug: string
  impact?: string
  tags?: string[]
  // Projeto pago no portfólio — sem entregável, só selo + preço + CTA de
  // contato (diferente do mecanismo de e-books, que tem arquivo protegido).
  isPaid?: boolean
  price?:  number | null
}

// Status de venda de um recurso pago (e-book).
export type SaleStatus    = 'active' | 'inactive' | 'coming_soon'

// Como o recurso é entregue após a compra:
// automatic = link imediato, manual = técnico envia, external_link = URL externa.
export type DeliveryType  = 'automatic' | 'manual' | 'external_link'

// Status de uma compra de e-book ou crédito.
export type PurchaseStatus = 'pending' | 'paid' | 'canceled' | 'refunded' | 'failed'

// Material educacional disponível para download (e-books, guias, templates).
// Gratuitos têm apenas fileUrl; pagos têm isPaid + campos de venda abaixo.
export interface Resource {
  id: string
  title: string
  description: string
  category: Omit<Category, 'Todos'>
  fileUrl: string
  coverUrl: string
  format?: string
  readTime?: string
  level?: string
  // E-books pagos — undefined/false em todo material gratuito existente.
  isPaid?:             boolean
  price?:              number | null
  saleDescription?:    string | null
  saleStatus?:         SaleStatus
  deliveryType?:       DeliveryType
  protectedFilePath?:  string | null
  // Preço em créditos — opcional, permite comprar com créditos além de
  // (ou em vez de) dinheiro. Sem isso o botão "Comprar com créditos" fica
  // oculto.
  creditPrice?:        number | null
}

// Linha de ebook_purchases — controla quem já pagou por um e-book pago.
export interface EbookPurchase {
  id:                 string
  ebook_id:           string
  user_id:            string
  amount:             number
  currency:           string
  status:             PurchaseStatus
  payment_provider?:  string | null
  payment_reference?: string | null
  paid_at?:           string | null
  created_at:         string
}

// Item do menu de navegação do site.
export interface NavItem {
  label: string
  href: string
}

// Card de serviço exibido na seção "Serviços" da landing page.
// accent define a paleta de cores do card.
export interface ServiceItem {
  icon: string
  title: string
  description: string
  items: string[]
  cta: string
  ctaHref: string
  result?: string
  accent?: 'blue' | 'purple' | 'cyan' | 'mixed'
  slug?: string
}

// Passo numerado usado em seções "Como funciona" ou tutoriais.
export interface Step {
  number: number
  title: string
  description: string
}

// Métrica de destaque exibida em cards de impacto na landing page.
export interface Metric {
  value: string
  label: string
  icon?: string
}

// Perfil de usuário cadastrado (clientes e técnicos compartilham a mesma tabela profiles).
export interface Profile {
  id: string
  full_name: string
  email: string
  company_name: string
  interest_area: string
  onboarded: boolean
  created_at: string
  phone?:    string | null
  document?: string | null
}

// Dados do formulário de contato público (tabela contacts).
// Preenchido pelo visitante antes de se tornar um Lead ou ClientProject.
export interface ContactForm {
  name: string
  email: string
  phone: string
  company: string
  interest_area: string
  message: string
}

// Dados coletados quando um visitante faz download de um material gratuito.
// Persiste na tabela downloads para geração de leads.
export interface DownloadLead {
  name: string
  email: string
  company: string
  interest_area: string
  resource_id: string
}

// Possíveis estados de uma fase do projeto no timeline do cliente.
export type ProjectPhaseStatus = 'concluido' | 'atual' | 'proximo' | 'aguardando_cliente' | 'bloqueado'

// Uma etapa do ciclo de vida do projeto (ex: "Diagnóstico", "Desenvolvimento").
// internalNote é visível apenas para técnicos; visibleToClient controla a exibição no dashboard.
export interface ProjectPhase {
  title:            string
  status:           ProjectPhaseStatus
  description?:     string
  internalNote?:    string
  visibleToClient?: boolean
}

// Entrada no histórico de atualizações do projeto — o que aconteceu, quando e quem fez.
export interface ProjectUpdateEntry {
  date:         string
  type:         string
  title:        string
  description:  string
  responsavel?: string
}

// Módulo funcional de um projeto (ex: "Autenticação", "Relatórios").
// progress é um percentual de 0 a 100. visibleToClient determina se aparece no portal.
export interface ProjectModule {
  id:               string
  name:             string
  description?:     string
  status:           'nao_iniciado' | 'em_andamento' | 'aguardando_validacao' | 'concluido' | 'aguardando_cliente' | 'bloqueado'
  progress:         number
  icon?:            string
  visibleToClient?: boolean
}

// Relatório executivo semanal gerado pelo técnico e opcionalmente exibido ao cliente.
export interface ExecutiveReport {
  weekSummary?:       string
  completedProgress?: string
  risks?:             string
  nextMilestone?:     string
  finalNote?:         string
  visibleToClient?:   boolean
}

// Item de checklist de segurança (ex: "Autenticação 2FA habilitada").
// checked indica se o item foi verificado; visibleToClient controla visibilidade no portal.
export interface SecurityChecklistItem {
  id:               string
  label:            string
  checked:          boolean
  visibleToClient?: boolean
}

// Status de aprovação de um entregável pelo cliente.
export type ApprovalStatus = 'aguardando' | 'aprovado' | 'ajustes_solicitados'

// Status de um ativo visual (imagem, documento, tela) no fluxo de aprovação.
export type VisualStatus = 'planejado' | 'em_desenvolvimento' | 'em_validacao' | 'aguardando_aprovacao' | 'aprovado' | 'ajuste_solicitado'

// Imagem de um entregável visual (wireframe, mockup, protótipo) no projeto.
export interface VisualImage {
  id:               string
  title:            string
  description?:     string
  url:              string
  phase?:           string
  status:           VisualStatus
  visibleToClient?: boolean
  createdAt:        string
}

// Documento de projeto (PDF, DOCX, etc.) compartilhado com o cliente.
// documentType categoriza o documento (ex: "proposta", "contrato", "especificação").
export interface VisualDocument {
  id:               string
  title:            string
  description?:     string
  fileUrl:          string
  type:             string
  fileName?:        string
  fileType?:        string
  documentType?:    string
  phase?:           string
  status:           VisualStatus
  visibleToClient?: boolean
  createdAt:        string
}

// Etapa de um fluxo de processo (ex: fluxo de uso do sistema entregue).
// order define a ordem de exibição na visualização de fluxo.
export interface FlowStep {
  id:               string
  title:            string
  description:      string
  icon:             string
  status:           string
  order?:           number
  visibleToClient?: boolean
}

// Grupo de telas de um módulo no mapa de telas do sistema.
// screens é a lista de nomes/descrições de telas pertencentes ao módulo.
export interface ScreenMapGroup {
  id:               string
  module:           string
  description?:     string
  screens:          string[]
  status?:          VisualStatus
  visibleToClient?: boolean
}

// Papel no organograma do projeto (ex: "Tech Lead", "Designer").
// level define a hierarquia visual — quanto menor, mais alto na árvore.
export interface OrgChartRole {
  id:               string
  role:             string
  name?:            string
  description?:     string
  level?:           number
  visibleToClient?: boolean
}

// Entregável formal do projeto (ex: "MVP", "Módulo de pagamentos").
// dueDate é a data-alvo de entrega; imageUrl pode ser uma prévia ou screenshot.
export interface Deliverable {
  id:               string
  title:            string
  description?:     string
  status:           VisualStatus
  imageUrl?:        string
  phase?:           string
  dueDate?:         string
  visibleToClient?: boolean
}

// Conjunto de todos os ativos visuais de um projeto de cliente.
// Agrupa imagens, documentos, fluxos, mapa de telas, organograma e entregáveis.
export interface ClientVisualAssets {
  images?:            VisualImage[]
  documents?:         VisualDocument[]
  flowSteps?:         FlowStep[]
  screenMap?:         ScreenMapGroup[]
  organizationChart?: OrgChartRole[]
  deliverables?:      Deliverable[]
}

// Estado de progresso do projeto visível para o cliente no dashboard /dashboard/projetos.
// Armazenado como JSONB na coluna client_progress de client_projects.
export interface ClientProgress {
  currentPhase?:        string
  nextMilestone?:       string
  nextMilestoneDate?:        string
  nextMilestoneDescription?: string
  projectSummary?:      string
  completedItems?:      string[]
  inProgressItems?:     string[]
  nextSteps?:           string[]
  clientPendingItems?:  string[]
  phases?:              ProjectPhase[]
  updateHistory?:       ProjectUpdateEntry[]
  securitySummary?:     string
  securityVisibleToClient?: boolean
  securityItems?:       SecurityChecklistItem[]
  securityDetails?:     string
  securityInternalNotes?: string
  modules?:             ProjectModule[]
  executiveReport?:     ExecutiveReport
  approvalRequired?:    boolean
  approvalMessage?:     string
  approvalStatus?:      ApprovalStatus
  approvalClientNote?:  string
  approvalRespondedAt?: string
  clientVisualAssets?:  ClientVisualAssets
  priorityVisibleToClient?: boolean
}

// Linha real da tabela client_projects — fonte única (antes duplicada como
// ClientProject em app/dashboard/projetos/page.tsx e CP em
// app/admin/projetos-clientes/ProjetosClientesClient.tsx, com drift entre
// as duas: CP tinha client_id/lead_technician_id/client_*/profiles que
// ClientProject não declarava, embora sejam a mesma linha de banco).
export interface ClientProject {
  id:                  string
  client_id:           string
  title:               string
  description?:        string | null
  category?:           string | null
  status:              string
  progress:            number
  priority:            string
  notes?:              string | null
  deadline?:           string | null
  created_at:          string
  updated_at:          string
  client_name?:        string
  client_email?:       string
  client_phone?:       string
  client_company?:     string
  client_document?:    string
  lead_technician_id?: string | null
  client_progress?:    ClientProgress
  // Perfil do técnico responsável — anexado manualmente pelo client
  // component (não é join de query), não uma coluna de client_projects.
  profiles?:           { full_name?: string; email?: string } | null
  // Pagamento com créditos — leader-only (trigger
  // client_projects_prevent_credit_cost_escalation garante isso no banco).
  credit_cost?:            number | null
  allow_credit_payment?:   boolean
  credit_payment_status?:  CreditPaymentStatus
}

// Lead de download de material (tabela downloads) — antes duplicado em
// app/admin/leads/LeadsClient.tsx e app/admin/AdminDashboardClient.tsx.
export interface Lead {
  id:             string
  name:           string
  email:          string
  company?:       string
  interest_area?: string
  resource_id:    string
  created_at:     string
}

// Perfil de técnico (linha de profiles com role='technician') — antes
// duplicado em app/admin/solicitacoes/page.tsx, ProjetosClientesClient.tsx
// e EquipeClient.tsx (esta com is_leader/created_at extras, já incluídos
// aqui como opcionais em vez de um shape à parte).
export interface Technician {
  id:          string
  full_name?:  string
  email?:      string
  is_leader?:  boolean
  created_at?: string
}

// Mensagem de chat cliente↔técnico (tabela messages) — antes duplicada em
// app/dashboard/mensagens/page.tsx e redeclarada à parte em
// app/admin/mensagens/MensagensClient.tsx.
export interface ChatMessage {
  id:             string
  client_id:      string
  sender_id:      string
  sender_role:    string
  technician_id?: string | null
  // null = conversa geral (suporte, sem projeto específico — qualquer
  // técnico participa); preenchido = conversa do projeto, restrita ao
  // técnico líder e ao lead_technician_id daquele projeto.
  project_id?:    string | null
  content:        string
  read_at?:       string | null
  created_at:     string
}

// Resumo de uma thread de chat — uma "conversa geral" (project null) e/ou
// uma por projeto do cliente que já tem técnico responsável.
export interface ChatThread {
  projectId:       string | null
  projectTitle?:   string | null
  technicianId?:   string | null
  technicianName?: string | null
}

// Tipo de lançamento financeiro no módulo de controle financeiro.
export type FinanceType   = 'ebook' | 'projeto' | 'visita_tecnica' | 'consultoria' | 'mensalidade' | 'creditos' | 'outro'

// Status de um lançamento financeiro.
export type FinanceStatus = 'pago' | 'pendente' | 'cancelado' | 'reembolsado' | 'negociacao'

// Forma de pagamento registrada em uma transação financeira.
export type PaymentMethod = 'pix' | 'cartao' | 'boleto' | 'dinheiro' | 'transferencia' | 'outro'

// Linha da tabela financial_transactions — controle financeiro, visível só
// pro técnico líder (ver lib/services/profile.ts:requireLeaderSession).
export interface FinancialTransaction {
  id:                   string
  type:                 FinanceType
  client_id?:           string | null
  client_name?:         string | null
  company_name?:        string | null
  description:          string
  amount:               number
  status:               FinanceStatus
  payment_method?:      PaymentMethod | null
  sale_date:            string
  received_date?:       string | null
  responsible_user_id?: string | null
  notes?:               string | null
  created_at:           string
  updated_at:           string
}

// ── Sistema de créditos ──────────────────────────────────────────────

// Tipo de movimentação na carteira de créditos do cliente.
export type CreditTxType   = 'purchase' | 'ebook_purchase' | 'project_payment' | 'technical_visit' | 'manual_adjustment' | 'refund' | 'bonus' | 'expiration'

// Status da transação de crédito (espelha PurchaseStatus mas para créditos).
export type CreditTxStatus = 'pending' | 'completed' | 'canceled' | 'failed' | 'refunded'

// Direção da movimentação: credit = entrada (compra/bônus), debit = saída (uso).
export type CreditDirection = 'credit' | 'debit'

// Status da compra de um pacote de créditos.
export type CreditPurchaseStatus = 'pending' | 'paid' | 'canceled' | 'failed' | 'refunded'

// Status do pagamento via créditos de um projeto de cliente.
// nao_aplicavel = projeto sem opção de crédito habilitada.
export type CreditPaymentStatus  = 'nao_aplicavel' | 'pendente' | 'pago'

// Pacote de créditos disponível para compra (tabela credit_packages).
// is_featured destaca o pacote recomendado na tela de compra.
export interface CreditPackage {
  id:               string
  name:             string
  description?:     string | null
  credits_amount:   number
  price:            number
  currency:         string
  is_active:        boolean
  is_featured:      boolean
  stripe_price_id?: string | null
  created_by?:      string | null
  created_at:       string
  updated_at:       string
}

// Carteira de créditos do cliente (tabela credit_wallets, uma por usuário).
// balance é o saldo atual; total_purchased e total_spent são acumulados históricos.
export interface ClientCreditWallet {
  id:              string
  user_id:         string
  balance:         number
  total_purchased: number
  total_spent:     number
  created_at:      string
  updated_at:      string
}

// Movimentação individual na carteira de créditos (tabela credit_transactions).
// balance_after registra o saldo após o lançamento — evita recalcular o histórico.
// reference_type/reference_id vinculam ao recurso que gerou a movimentação (ex: ebook, projeto).
export interface CreditTransaction {
  id:             string
  wallet_id:      string
  user_id:        string
  type:           CreditTxType
  amount:         number
  direction:      CreditDirection
  balance_after:  number
  description:    string
  status:         CreditTxStatus
  reference_type?: string | null
  reference_id?:   string | null
  created_by?:     string | null
  created_at:      string
}

// Compra de um pacote de créditos (tabela credit_purchases).
// package e buyer_* são anexados client-side por joins manuais, não são colunas da tabela.
export interface CreditPurchase {
  id:                       string
  user_id:                  string
  package_id:               string
  credits_amount:           number
  amount_paid:              number
  currency:                 string
  status:                   CreditPurchaseStatus
  payment_provider?:        string | null
  payment_reference?:       string | null
  stripe_session_id?:       string | null
  stripe_payment_intent_id?: string | null
  paid_at?:                 string | null
  created_at:               string
  updated_at:               string
  // Anexados manualmente pelos components (join client-side), não colunas.
  package?:                 { name: string } | null
  buyer_name?:              string | null
  buyer_email?:             string | null
}

// Fases padrão pré-definidas para novos projetos de cliente.
// Usadas como valor inicial de client_progress.phases quando um projeto é criado.
// Todas começam como 'proximo' — o técnico atualiza o status conforme o projeto avança.
export const DEFAULT_PROJECT_PHASES: ProjectPhase[] = [
  { title: 'Diagnóstico',        status: 'proximo', description: 'Entendemos as necessidades e objetivos do projeto.' },
  { title: 'Planejamento',       status: 'proximo', description: 'Definimos o escopo, os módulos e o fluxo principal.' },
  { title: 'Design / Protótipo', status: 'proximo', description: 'Criamos a estrutura visual e a experiência do usuário.' },
  { title: 'Desenvolvimento',    status: 'proximo', description: 'Construímos as funcionalidades principais do sistema.' },
  { title: 'Testes',             status: 'proximo', description: 'Validamos segurança, usabilidade e funcionamento.' },
  { title: 'Homologação',        status: 'proximo', description: 'Conferimos tudo junto com você antes da entrega final.' },
  { title: 'Entrega',            status: 'proximo', description: 'Publicamos a versão final para uso.' },
  { title: 'Suporte inicial',    status: 'proximo', description: 'Acompanhamos de perto o começo do uso do sistema.' },
]
