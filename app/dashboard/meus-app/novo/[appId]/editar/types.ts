/** Forma do estado de edição — espelha as colunas reais de app_drafts, não
 *  um blob solto. Cada campo aqui tem uma coluna correspondente na tabela;
 *  salvar é um PATCH direto com esses nomes, sem tradução. */
export interface DraftFormData {
  name: string | null
  category_id: string | null
  category: string | null
  short_description: string | null
  full_description: string | null
  target_audience: string | null
  website_url: string | null
  video_url: string | null
  logo_url: string | null
  media_gallery: { url: string; alt_text?: string; type?: string }[]
  benefits: { title: string }[]
  features: { name: string; description?: string }[]
  integrations: { name: string; url?: string }[]
  history: { title: string; description: string }[]
  trust_signals: { title: string; url?: string }[]
  faq: { question: string; answer: string }[]
}

export function draftToFormData(draft: Record<string, unknown>): DraftFormData {
  return {
    name: (draft.name as string) ?? null,
    category_id: (draft.category_id as string) ?? null,
    category: (draft.category as string) ?? null,
    short_description: (draft.short_description as string) ?? null,
    full_description: (draft.full_description as string) ?? null,
    target_audience: (draft.target_audience as string) ?? null,
    website_url: (draft.website_url as string) ?? null,
    video_url: (draft.video_url as string) ?? null,
    logo_url: (draft.logo_url as string) ?? null,
    media_gallery: (draft.media_gallery as DraftFormData['media_gallery']) ?? [],
    benefits: (draft.benefits as DraftFormData['benefits']) ?? [],
    features: (draft.features as DraftFormData['features']) ?? [],
    integrations: (draft.integrations as DraftFormData['integrations']) ?? [],
    history: (draft.history as DraftFormData['history']) ?? [],
    trust_signals: (draft.trust_signals as DraftFormData['trust_signals']) ?? [],
    faq: (draft.faq as DraftFormData['faq']) ?? [],
  }
}
