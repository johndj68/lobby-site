import { redirect } from 'next/navigation'

/* /dashboard/meus-app/apps-status nunca existiu como página — os botões
 * "Acompanhar cadastros" e "Ver status" em NovoAppClient.tsx (fluxo de
 * cadastro) sempre apontaram pra cá e sempre deram 404. Essa rota estática
 * também evita que esse caminho caia no [appId] dinâmico (que trataria
 * "apps-status" como se fosse um id de app). O destino real é a listagem. */
export default function AppsStatusRedirect() {
  redirect('/dashboard/meus-app')
}
