import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import ProductMediaEditor from '@/components/vendor/editor/ProductMediaEditor'

export const metadata: Metadata = {
  title: 'Editar Aplicativo | LOBBY Parceiros',
  description: 'Crie a página do seu aplicativo',
}

export default async function EditAppPage({
  params: { id },
}: {
  params: { id: string }
}) {
  const supabase = await createServerSupabaseClient()

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=/vendedor/aplicativos/${id}/editar`)
  }

  // Load draft with authorization check
  const { data: draft, error } = await supabase
    .from('app_drafts')
    .select(
      `
      id,
      organization_id,
      created_by,
      name,
      website_url,
      import_source,
      short_description,
      full_description,
      logo_url,
      category,
      subcategory,
      target_audience,
      languages,
      features,
      benefits,
      integrations,
      platforms,
      requirements,
      media_gallery,
      video_url,
      support_email,
      documentation_url,
      setup_instructions,
      plans,
      stage,
      status,
      last_edited_at,
      created_at,
      organizations!inner (id)
    `
    )
    .eq('id', id)
    .single()

  if (error || !draft) {
    redirect('/vendedor/aplicativos')
  }

  // Check authorization: user must belong to same organization
  const { data: userOrgs } = await supabase
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', user.id)

  const hasAccess = userOrgs?.some((org) => org.organization_id === draft.organization_id)

  if (!hasAccess) {
    redirect('/vendedor/aplicativos')
  }

  return (
    <ProductMediaEditor
      draftId={id}
      initialData={draft}
      user={user}
    />
  )
}
