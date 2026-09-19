/* Dados estáticos do site público da LOBBY.
   Contém portfólio, serviços, recursos educativos, etapas do processo
   e métricas institucionais. Por serem estáticos (não vêm do banco),
   qualquer atualização de conteúdo exige editar este arquivo diretamente.
   Importado nas páginas de landing, portfólio e recursos do site público. */

import { Project, Resource, ServiceItem, Step, Metric } from '@/types'

/* Projetos de portfólio exibidos na página pública "/portfolio".
   Cada item representa um caso de sucesso da empresa, agrupado por
   categoria de serviço. O campo "impact" é o resultado mensurável
   que aparece em destaque no card para mostrar valor ao cliente. */
export const projects: Project[] = [
  {
    id: '1',
    title: 'Dashboard Financeiro Inteligente',
    description: 'Visão completa das finanças em tempo real com indicadores, previsões e relatórios personalizados.',
    category: 'Dados',
    imageUrl: '/images/projects/dashboard-financeiro.jpg',
    slug: 'dashboard-financeiro-inteligente',
    impact: '+35% na eficiência financeira',
    tags: ['BI', 'Relatórios', 'Indicadores'],
  },
  {
    id: '2',
    title: 'Automação de Atendimento Comercial',
    description: 'Fluxos automáticos que qualificam leads, distribuem atendimentos e aceleram o ciclo de vendas.',
    category: 'Automação',
    imageUrl: '/images/projects/automacao-atendimento.jpg',
    slug: 'automacao-atendimento-comercial',
    impact: '+48% em conversão de leads',
    tags: ['CRM', 'Fluxos', 'Leads'],
  },
  {
    id: '3',
    title: 'Portal do Cliente',
    description: 'Área do cliente moderna e segura para acompanhar pedidos, contratos, faturas e suporte.',
    category: 'Software',
    imageUrl: '/images/projects/portal-cliente.jpg',
    slug: 'portal-do-cliente',
    impact: '-30% em chamados de suporte',
    tags: ['Portal', 'Pedidos', 'Suporte'],
  },
  {
    id: '4',
    title: 'Sistema de Gestão Interna',
    description: 'Centralize processos, documentos e tarefas da equipe em um único ambiente integrado.',
    category: 'Software',
    imageUrl: '/images/projects/gestao-interna.jpg',
    slug: 'sistema-gestao-interna',
    impact: '+40% na produtividade',
    tags: ['Gestão', 'Processos', 'Equipe'],
  },
  {
    id: '5',
    title: 'Checklist de Segurança Digital',
    description: 'Ferramenta interativa para avaliar, monitorar e elevar o nível de segurança da empresa.',
    category: 'Cibersegurança',
    imageUrl: '/images/projects/seguranca-digital.jpg',
    slug: 'checklist-seguranca-digital',
    impact: 'Menos riscos digitais',
    tags: ['Segurança', 'LGPD', 'Auditoria'],
  },
  {
    id: '6',
    title: 'Automação de Relatórios',
    description: 'Gere relatórios automáticos e personalizados com dados integrados de múltiplas fontes.',
    category: 'Automação',
    imageUrl: '/images/projects/automacao-relatorios.jpg',
    slug: 'automacao-de-relatorios',
    impact: '-60% no tempo de relatórios',
    tags: ['Relatórios', 'Dados', 'Automação'],
  },
]

/* Recursos educativos gratuitos (e-books, PDFs) disponíveis para download
   na página "/recursos". Servem para atrair leads qualificados oferecendo
   conteúdo de valor antes de uma proposta comercial.
   - fileUrl: caminho do PDF para download direto
   - coverUrl: imagem de capa exibida no card
   - level: indica o público-alvo (Iniciante / Intermediário) */
export const resources: Resource[] = [
  {
    id: '1',
    title: 'Guia básico de automação para pequenas empresas',
    description: 'Como automatizar processos repetitivos e ganhar tempo, reduzindo erros e custos.',
    category: 'Automação',
    fileUrl: '/downloads/guia-automacao-pme.pdf',
    coverUrl: '/images/resources/guia-automacao.jpg',
    format: 'PDF', readTime: '8 min', level: 'Iniciante',
  },
  {
    id: '2',
    title: 'Checklist de cibersegurança empresarial',
    description: 'Passos essenciais para proteger os dados da sua empresa e reduzir riscos digitais.',
    category: 'Cibersegurança',
    fileUrl: '/downloads/checklist-ciberseguranca.pdf',
    coverUrl: '/images/resources/checklist-seguranca.jpg',
    format: 'PDF', readTime: '5 min', level: 'Intermediário',
  },
  {
    id: '3',
    title: 'Introdução à análise de dados para negócios',
    description: 'Entenda conceitos-chave e use dados para tomar decisões mais inteligentes.',
    category: 'Dados',
    fileUrl: '/downloads/intro-analise-dados.pdf',
    coverUrl: '/images/resources/analise-dados.jpg',
    format: 'PDF', readTime: '10 min', level: 'Iniciante',
  },
  {
    id: '4',
    title: 'Como preparar sua empresa para usar IA',
    description: 'Guia prático para começar a adotar inteligência artificial de forma estratégica.',
    category: 'Automação',
    fileUrl: '/downloads/guia-ia-empresas.pdf',
    coverUrl: '/images/resources/ia-empresas.jpg',
    format: 'PDF', readTime: '12 min', level: 'Intermediário',
  },
  {
    id: '5',
    title: 'Boas práticas para software sob medida',
    description: 'Descubra como criar sistemas sob medida com foco em performance e escalabilidade.',
    category: 'Software',
    fileUrl: '/downloads/boas-praticas-software.pdf',
    coverUrl: '/images/resources/software-medida.jpg',
    format: 'PDF', readTime: '9 min', level: 'Iniciante',
  },
  {
    id: '6',
    title: 'Guia rápido de produtividade com automação',
    description: 'Ferramentas e dicas para automatizar tarefas e melhorar a produtividade da equipe.',
    category: 'Automação',
    fileUrl: '/downloads/guia-produtividade.pdf',
    coverUrl: '/images/resources/produtividade.jpg',
    format: 'PDF', readTime: '6 min', level: 'Iniciante',
  },
]

/* Descrições dos 4 serviços oferecidos pela LOBBY, exibidas na seção
   "Serviços" da landing page e na página dedicada "/servicos".
   - icon: nome do ícone Lucide renderizado dinamicamente pelo componente de card
   - items: lista de entregas concretas (bullets) que convencem o cliente
   - cta / ctaHref: texto e destino do botão de conversão de cada card
   - result: frase de resultado rápido exibida em destaque no card
   - accent: paleta de cor do card (blue, purple, cyan, mixed)
   - slug: identificador usado em links e filtros */
export const services: ServiceItem[] = [
  {
    icon: 'Code2',
    title: 'Software sob medida',
    description: 'Desenvolvemos sistemas personalizados que se adaptam à realidade do seu negócio.',
    items: ['Sistemas web e mobile', 'Portais e aplicações', 'Integrações', 'APIs e muito mais'],
    cta: 'Quero um software',
    ctaHref: '/contato',
    result: 'Mais agilidade e eficiência',
    accent: 'blue',
    slug: 'software',
  },
  {
    icon: 'Settings2',
    title: 'Automação empresarial',
    description: 'Automatizamos tarefas repetitivas para ganhar produtividade e reduzir erros.',
    items: ['Automação de fluxos', 'RPA e bots', 'Ganho de eficiência', 'Integrações com sistemas'],
    cta: 'Automatizar minha empresa',
    ctaHref: '/contato',
    result: 'Menos tarefas manuais',
    accent: 'purple',
    slug: 'automacao',
  },
  {
    icon: 'BarChart3',
    title: 'Dados e inteligência',
    description: 'Transformamos dados em insights para decisões mais assertivas e estratégicas.',
    items: ['Dashboards e BI', 'Análise preditiva', 'Indicadores e KPIs', 'Alertas e insights'],
    cta: 'Criar dashboard',
    ctaHref: '/contato',
    result: 'Decisões em tempo real',
    accent: 'cyan',
    slug: 'dados',
  },
  {
    icon: 'Shield',
    title: 'Cibersegurança',
    description: 'Protegemos seus dados e sistemas com as melhores práticas do mercado.',
    items: ['Auditoria', 'Teste de invasão', 'Proteção de dados', 'Conformidade LGPD'],
    cta: 'Proteger minha empresa',
    ctaHref: '/contato',
    result: 'Menos riscos digitais',
    accent: 'mixed',
    slug: 'ciberseguranca',
  },
]

/* Etapas do processo de trabalho da LOBBY, exibidas na seção
   "Como trabalhamos" da landing page. Mostram ao cliente em potencial
   como é a jornada desde o primeiro contato até a entrega do projeto,
   transmitindo transparência e metodologia. */
export const howWeWorkSteps: Step[] = [
  {
    number: 1,
    title: 'Diagnóstico',
    description: 'Entendemos seus desafios, objetivos e contexto para mapear oportunidades.',
  },
  {
    number: 2,
    title: 'Estratégia',
    description: 'Desenhamos a melhor solução com tecnologia, pessoas e processos.',
  },
  {
    number: 3,
    title: 'Desenvolvimento',
    description: 'Construímos, testamos e validamos com agilidade e qualidade.',
  },
  {
    number: 4,
    title: 'Entrega e evolução',
    description: 'Implantamos com segurança e evoluímos continuamente junto com seu negócio.',
  },
]

/* Números de prova social exibidos na seção de métricas da landing page.
   Reforçam credibilidade e escala da empresa para visitantes que ainda
   não conhecem a LOBBY. O campo "icon" referencia um ícone Lucide
   renderizado dinamicamente pelo componente de métrica. */
export const metrics: Metric[] = [
  { value: '+120', label: 'Projetos entregues', icon: 'Rocket' },
  { value: '+80', label: 'Empresas atendidas', icon: 'Building2' },
  { value: '+98%', label: 'Satisfação dos clientes', icon: 'Star' },
  { value: '-35%', label: 'Tempo médio de execução', icon: 'Clock' },
]

/* Recursos recomendados exibidos no dashboard do cliente (área logada).
   Diferente da lista pública "resources", estes são curados especificamente
   para aparecerem no painel de boas-vindas, incentivando o cliente a
   consumir conteúdo educativo enquanto acompanha seus projetos.
   - coverCategory: define qual paleta de cor/ícone usar na capa do card
   - tags: exibidas como chips informativos (formato, tempo, nível) */
export const dashboardRecommendedResources = [
  {
    id: 'r1',
    category: 'E-book',
    coverCategory: 'Automação',
    title: 'Guia completo de Automação de Processos',
    description: 'Aprenda a automatizar tarefas e aumentar a eficiência da sua empresa.',
    tags: ['PDF', '10 min', 'Iniciante'],
  },
  {
    id: 'r2',
    category: 'Guia',
    coverCategory: 'Cibersegurança',
    title: 'Cibersegurança para empresas modernas',
    description: 'Estratégias essenciais para proteger dados e garantir a continuidade do negócio.',
    tags: ['PDF', '12 min', 'Intermediário'],
  },
  {
    id: 'r3',
    category: 'E-book',
    coverCategory: 'Dados',
    title: 'Tomada de decisão baseada em dados',
    description: 'Como transformar informações em insights que geram resultados reais.',
    tags: ['PDF', '8 min', 'Iniciante'],
  },
  {
    id: 'r4',
    category: 'Guia',
    coverCategory: 'Software',
    title: 'Checklist: Transformação digital na prática',
    description: 'Passo a passo para iniciar a transformação digital com segurança e eficiência.',
    tags: ['PDF', '15 min', 'Iniciante'],
  },
]
