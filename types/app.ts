export interface AppDraft {
  id: string
  name: string | null
  website_url: string | null
  short_description: string | null
  full_description: string | null
  logo_url: string | null
  category: string | null
  target_audience: string | null
  languages: string[] | null
  features: any
  benefits: any
  integrations: any
  platforms: string[] | null
  requirements: string | null
  media_gallery: any
  video_url: string | null
  support_email: string | null
  documentation_url: string | null
  setup_instructions: string | null
  stage: number
  status: string
  created_at: string
  updated_at: string
}

export interface Plan {
  id?: string
  name: string
  currency: string
  price: number | null
  billing_period: string
  features: string[] | null
  limits?: any
  users_limit?: number | null
  support_level?: string | null
  activation_method?: string
  activation_instructions?: string | null
  display_order?: number
}
