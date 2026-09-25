/**
 * Validação centralizada para revisão de apps
 * Reutiliza schemas das etapas anteriores
 */

export interface ReviewIssue {
  section: string
  field: string
  severity: 'blocked' | 'warning' | 'info'
  message: string
  action?: 'edit' | 'upload' | 'add'
  editRoute?: string
  editTab?: string
}

export interface ReviewChecklistItem {
  id: string
  name: string
  icon: string
  status: 'complete' | 'pending' | 'optional' | 'warning'
  issues: ReviewIssue[]
  summary: string
  editRoute: string
  editTab?: string
}

export interface ReviewResult {
  app: any
  items: ReviewChecklistItem[]
  blockers: number
  warnings: number
  hasTeam: boolean
  isTeamOptional: boolean
}

export function validateBasicInfo(draft: any): ReviewChecklistItem {
  const issues: ReviewIssue[] = []

  if (!draft.name?.trim()) {
    issues.push({
      section: 'basicInfo',
      field: 'name',
      severity: 'blocked',
      message: 'Nome do aplicativo é obrigatório',
      action: 'edit',
      editRoute: 'editar',
    })
  }

  if (!draft.short_description?.trim()) {
    issues.push({
      section: 'basicInfo',
      field: 'short_description',
      severity: 'blocked',
      message: 'Descrição breve é obrigatória',
      action: 'edit',
      editRoute: 'editar',
    })
  }

  if (!draft.full_description?.trim()) {
    issues.push({
      section: 'basicInfo',
      field: 'full_description',
      severity: 'blocked',
      message: 'Descrição completa é obrigatória',
      action: 'edit',
      editRoute: 'editar',
    })
  }

  if (!draft.category_id) {
    issues.push({
      section: 'basicInfo',
      field: 'category',
      severity: 'blocked',
      message: 'Categoria é obrigatória',
      action: 'edit',
      editRoute: 'editar',
    })
  }

  if (!draft.website_url?.trim()) {
    issues.push({
      section: 'basicInfo',
      field: 'website_url',
      severity: 'blocked',
      message: 'URL do aplicativo é obrigatória',
      action: 'edit',
      editRoute: 'editar',
    })
  }

  return {
    id: 'basicInfo',
    name: 'Informações básicas',
    icon: '📋',
    status: issues.length === 0 ? 'complete' : 'pending',
    issues,
    summary: issues.length === 0 ? 'Todas as informações preenchidas' : `${issues.length} pendência(s)`,
    editRoute: 'editar',
  }
}

export function validateMedia(draft: any): ReviewChecklistItem {
  const issues: ReviewIssue[] = []

  if (!draft.logo_url?.trim()) {
    issues.push({
      section: 'media',
      field: 'logo',
      severity: 'blocked',
      message: 'Logo é obrigatório',
      action: 'upload',
      editRoute: 'editar',
      editTab: 'media',
    })
  }

  if (!draft.media_gallery || (Array.isArray(draft.media_gallery) && draft.media_gallery.length === 0)) {
    issues.push({
      section: 'media',
      field: 'gallery',
      severity: 'blocked',
      message: 'Galeria de imagens é obrigatória (mínimo 1)',
      action: 'upload',
      editRoute: 'editar',
      editTab: 'media',
    })
  }

  return {
    id: 'media',
    name: 'Mídia',
    icon: '🖼️',
    status: issues.length === 0 ? 'complete' : 'pending',
    issues,
    summary: issues.length === 0 ? 'Mídia completa' : `${issues.length} pendência(s)`,
    editRoute: 'editar',
    editTab: 'media',
  }
}

export function validateFeatures(draft: any): ReviewChecklistItem {
  const issues: ReviewIssue[] = []

  if (!draft.features || (Array.isArray(draft.features) && draft.features.length === 0)) {
    issues.push({
      section: 'features',
      field: 'features',
      severity: 'warning',
      message: 'Recomenda-se adicionar funcionalidades',
      action: 'edit',
      editRoute: 'editar',
      editTab: 'features',
    })
  }

  return {
    id: 'features',
    name: 'Funcionalidades',
    icon: '⚡',
    status: issues.length === 0 ? 'complete' : 'warning',
    issues,
    summary: draft.features?.length ? `${draft.features.length} funcionalidade(s)` : 'Sem funcionalidades',
    editRoute: 'editar',
    editTab: 'features',
  }
}

export function validateOfferAndPlans(plans: any[]): ReviewChecklistItem {
  const issues: ReviewIssue[] = []

  if (!plans || plans.length === 0) {
    issues.push({
      section: 'offer',
      field: 'plans',
      severity: 'blocked',
      message: 'Mínimo 1 plano é obrigatório',
      action: 'add',
      editRoute: 'editar',
      editTab: 'offer',
    })
  }

  // Validate each plan
  plans?.forEach((plan, idx) => {
    if (!plan.name?.trim()) {
      issues.push({
        section: 'offer',
        field: `plan_${idx}_name`,
        severity: 'blocked',
        message: `Plano ${idx + 1}: nome obrigatório`,
      })
    }
    if (plan.price === null || plan.price === undefined) {
      issues.push({
        section: 'offer',
        field: `plan_${idx}_price`,
        severity: 'blocked',
        message: `Plano ${idx + 1}: preço obrigatório`,
      })
    }
  })

  return {
    id: 'offer',
    name: 'Oferta e planos',
    icon: '💰',
    status: issues.length === 0 ? 'complete' : 'pending',
    issues,
    summary: issues.length === 0 ? `${plans?.length} plano(s) configurado(s)` : `${issues.length} pendência(s)`,
    editRoute: 'editar',
    editTab: 'offer',
  }
}

export function validateActivation(config: any, plans: any[]): ReviewChecklistItem {
  const issues: ReviewIssue[] = []

  if (!config?.activation_link?.trim()) {
    issues.push({
      section: 'activation',
      field: 'activation_link',
      severity: 'blocked',
      message: 'Link de ativação é obrigatório',
      action: 'edit',
      editRoute: 'ativacao',
    })
  }

  if (!config?.support_email?.trim()) {
    issues.push({
      section: 'activation',
      field: 'support_email',
      severity: 'blocked',
      message: 'E-mail de suporte é obrigatório',
      action: 'edit',
      editRoute: 'ativacao',
    })
  }

  return {
    id: 'activation',
    name: 'Ativação e entrega',
    icon: '📦',
    status: issues.length === 0 ? 'complete' : 'pending',
    issues,
    summary: issues.length === 0 ? 'Ativação configurada' : `${issues.length} pendência(s)`,
    editRoute: 'ativacao',
  }
}

export function validateOptionalSection(data: any, name: string, icon: string, id: string): ReviewChecklistItem {
  const hasData = data && (typeof data === 'string' ? data.trim().length > 0 : Array.isArray(data) ? data.length > 0 : Object.keys(data || {}).length > 0)

  return {
    id,
    name,
    icon,
    status: hasData ? 'complete' : 'optional',
    issues: [],
    summary: hasData ? 'Preenchido' : 'Não preenchido (opcional)',
    editRoute: 'editar',
    editTab: id,
  }
}

export function calculateReview(draft: any, plans: any[], config: any, teamMembers: any, teamInvitations: any): ReviewResult {
  const items = [
    validateBasicInfo(draft),
    validateMedia(draft),
    validateFeatures(draft),
    validateOfferAndPlans(plans),
    validateActivation(config, plans),
    validateOptionalSection(draft.history, 'História do produto', '📚', 'history'),
    validateOptionalSection(draft.benefits, 'Sinais de confiança', '⭐', 'signals'),
    validateOptionalSection(draft.faq, 'Perguntas frequentes', '❓', 'faq'),
  ]

  // Team section
  const teamIssues: ReviewIssue[] = []
  const hasTeam = (teamMembers?.length || 0) + (teamInvitations?.length || 0) > 0

  items.push({
    id: 'team',
    name: 'Equipe',
    icon: '👥',
    status: 'complete', // Equipe é sempre opcional
    issues: teamIssues,
    summary: hasTeam ? `${(teamMembers?.length || 0) + (teamInvitations?.length || 0)} colaborador(es)` : 'Sem colaboradores (opcional)',
    editRoute: 'equipe',
  })

  const blockers = items.reduce((sum, item) => sum + item.issues.filter(i => i.severity === 'blocked').length, 0)
  const warnings = items.reduce((sum, item) => sum + item.issues.filter(i => i.severity === 'warning').length, 0)

  return {
    app: draft,
    items,
    blockers,
    warnings,
    hasTeam,
    isTeamOptional: true,
  }
}
