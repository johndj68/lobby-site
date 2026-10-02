# Vendas e financeiro — entrada no dashboard (Etapa 2)

## Contexto

Etapa 2 do roadmap da área "Vendas e financeiro" do parceiro (pedido do
usuário de 2026-10-01, seção 17: "Entrada no dashboard — Adicionar
'Vendas e financeiro' na lateral clara e a navegação interna"). Etapa 1
(auditoria + snapshot de prazos financeiros) já está completa e em
produção. Esta etapa só constrói o **esqueleto de acesso** — item na
sidebar, detecção de vendedor, layout com sub-navegação, páginas stub.
Dado real (indicadores, vendas, repasses, ofertas) é Etapa 3 em diante,
fora de escopo aqui.

> **Correção pós-implementação (achado na review final, 2026-10-02):**
> as seções 2 e 3 abaixo descrevem `FinanceiroSellerGate` renderizando
> `<DashboardShell>` internamente — esse desenho tinha um bug real: o
> layout raiz (`app/dashboard/layout.tsx` → `DashboardLayoutWrapper`) já
> envolve TODA rota `/dashboard/**` em `DashboardShell`, então o gate
> remontava o shell uma segunda vez. As duas instâncias tentavam abrir o
> mesmo canal Realtime (`dash-msg-badge-${user.id}`) e a segunda
> `.subscribe()` quebrava com "cannot add postgres_changes callbacks
> after subscribe()" — toda a área caía com "Algo deu errado" pra
> qualquer usuário real. Corrigido no código: `FinanceiroSellerGate`
> **não** renderiza `DashboardShell`, só o próprio conteúdo (apresentação
> ou sub-nav + `children`), confiando no shell que o layout raiz já
> fornece — e não recebe mais `user`/`profile` como props (não eram
> usados pra mais nada). Achado só foi possível rodando de verdade no
> navegador — nem `tsc` nem a suite de testes detectam esse tipo de bug
> de árvore de componentes + estado client-side do Supabase Realtime.
> Também: **"`children` nunca é montado" (seção 2 abaixo) é impreciso**
> — o App Router do Next.js sempre executa o Server Component da página
> filha no servidor, independente do gate; o que o gate controla é só se
> o resultado é *exibido* no client. Inofensivo nesta etapa (stubs
> estáticos), mas relevante pra quem planejar a Etapa 3 em diante, onde
> as páginas vão fazer query de dado real — nessas, uma checagem de
> vendedor dedicada *dentro de cada página* (não só no layout) evita
> rodar query desnecessária pra quem não é vendedor.

## Objetivo

Todo cliente enxerga "Vendas e financeiro" na lateral. Quem já vende um
app no marketplace entra na área (sub-navegação funcionando, 5 páginas
acessíveis, cada uma com placeholder). Quem não vende ainda vê uma
apresentação com CTA pra cadastrar o primeiro app.

## Não-objetivos

- Qualquer indicador, valor ou dado financeiro real — Etapas 3-7.
- Permissões granulares de equipe (consultar vendas/financeiro/etc) —
  decisão do usuário (2026-10-01): fica pra Etapa 5 do roadmap. Nesta
  etapa, "é vendedor" = tem pelo menos um `app_drafts` (dono ou membro de
  equipe) — sem diferenciação de papel dentro da equipe ainda.
- Mudança em `/admin/financeiro` (painel administrativo, tema escuro,
  acesso da equipe) — continua inteiramente separado, nenhum arquivo
  deste spec toca lá.

## Detecção de vendedor

Mesmo padrão já usado em `/dashboard/meus-app/page.tsx`: consulta
`app_drafts` sem filtro explícito por `created_by`/usuário — a RLS já
restringe a "próprio OU membro de `app_team_members`" (confirmado por
leitura do código existente). Lista vazia = não vendedor. Nenhuma query
nova precisa ser inventada, é o mesmo acesso que a tela "Meus apps" já
usa pra listar.

## Arquivos

### 1. Sidebar — `components/layout/DashboardShell.tsx`

Novo item no array `navItems`, inserido logo depois de "Meus apps"
(índice 4) e antes de "Minhas compras":

```typescript
{ icon: Wallet, label: 'Vendas e financeiro', href: '/dashboard/financeiro', matchPrefix: true },
```

(`Wallet` já é usado como ícone financeiro em `/admin/financeiro` — mesmo
ícone, consistência visual entre as duas áreas financeiras mesmo sendo
temas diferentes. Precisa entrar no import de `lucide-react` já existente
no topo do arquivo.)

### 2. Layout com guarda de vendedor — `app/dashboard/financeiro/layout.tsx` (novo)

Server Component. Roda a checagem de vendedor **uma vez**, cobre as 5
páginas da área (inclusive acesso direto por URL a uma sub-rota, sem
passar pela Visão geral primeiro):

```typescript
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { requireClientSession } from '@/lib/services/profile'
import FinanceiroSellerGate from './FinanceiroSellerGate'

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { user, profile } = await requireClientSession(supabase)

  const { data: drafts } = await supabase.from('app_drafts').select('id').limit(1)
  const isSeller = (drafts?.length ?? 0) > 0

  return (
    <FinanceiroSellerGate user={user} profile={profile} isSeller={isSeller}>
      {children}
    </FinanceiroSellerGate>
  )
}
```

### 3. `FinanceiroSellerGate` — `app/dashboard/financeiro/FinanceiroSellerGate.tsx` (novo, client component)

Recebe `isSeller`. Se `false`: renderiza a apresentação (ver seção 4),
`children` nunca é montado. Se `true`: renderiza `DashboardShell` +
sub-navegação horizontal (desktop) / seletor (celular) + `children`.

Sub-navegação, mesmo padrão de `NAV_TABS` já usado em
`app/admin/marketplace/repasses/RepassesClient.tsx` (adaptado pro tema
claro do cliente em vez do escuro do admin):

```typescript
const FINANCEIRO_TABS = [
  { label: 'Visão geral',              href: '/dashboard/financeiro' },
  { label: 'Vendas',                   href: '/dashboard/financeiro/vendas' },
  { label: 'Repasses e extrato',       href: '/dashboard/financeiro/repasses' },
  { label: 'Ofertas e promoções',      href: '/dashboard/financeiro/ofertas' },
  { label: 'Configurações de recebimento', href: '/dashboard/financeiro/configuracoes' },
]
```

Desktop (`sm:` pra cima): linha horizontal de abas, aba ativa com
sublinhado azul (`colors.primary`), mesmo padrão visual do `NAV_TABS` do
admin, mas em fundo claro.

Celular: `<select>` nativo (ou dropdown customizado simples) com as
mesmas 5 opções — "seletor acessível" conforme pedido (seção 2 do
pedido original), sem reconstruir um componente de tabs responsivo do
zero.

### 4. Apresentação pra quem não é vendedor

Dentro do próprio `FinanceiroSellerGate` (não precisa de arquivo
separado — é um branch condicional simples, sem lógica própria):

- Título "Vendas e financeiro"
- Texto curto explicando o que é a área (uma vez que o usuário vire
  vendedor, aqui mostra vendas/repasses/ofertas dos próprios apps)
- Botão "Cadastrar meu aplicativo" → `/dashboard/meus-app/novo`
- Sem sub-navegação (nada pra navegar ainda)

### 5. Páginas stub — 5 arquivos

```
app/dashboard/financeiro/page.tsx               (Visão geral)
app/dashboard/financeiro/vendas/page.tsx
app/dashboard/financeiro/repasses/page.tsx
app/dashboard/financeiro/ofertas/page.tsx
app/dashboard/financeiro/configuracoes/page.tsx
```

Cada uma: Server Component simples, sem query própria (o layout já
decidiu se o usuário chega até aqui), card branco com título da página +
texto "Em construção — essa área está sendo desenvolvida." Nenhuma
chama dado financeiro real — isso é Etapa 3+.

## Identidade visual

Tokens já existentes em `lib/design-tokens.ts` (sem criar nenhum token
novo):
- Fundo: `colors.backgroundAlt` (`#F7F8FC`)
- Cards: `colors.card` (`#FFFFFF`), sombra `shadows.card`
- Títulos: `colors.text` (`#0B1020`, azul-marinho)
- Ações/aba ativa: `colors.primary` (`#005BFF`)
- Bordas: `colors.border` (`#E3E7F0`)

Mesma sidebar, cabeçalho, fonte e componentes do dashboard atual — o
layout novo só adiciona a sub-navegação horizontal/seletor dentro da
área de conteúdo, não toca em `DashboardShell`.

## Erros e casos de borda

- **Usuário vira vendedor enquanto está na apresentação**: não tratado
  nesta etapa (sem realtime) — próxima navegação/reload já reflete,
  consistente com o resto do dashboard (nenhuma outra tela do client
  dashboard tem atualização em tempo real hoje).
- **Acesso direto a `/dashboard/financeiro/vendas` sem ser vendedor**: o
  `layout.tsx` intercepta antes de qualquer página filha montar —
  mostra a apresentação, não a página stub.
- **Usuário sem sessão**: `requireClientSession` já redireciona pra
  `/login`, mesmo padrão de toda rota client.

## Testes

Nenhum teste automatizado novo — zero precedente de teste pra páginas
`app/dashboard/**` ou pro próprio `DashboardShell.tsx` neste projeto
(confirmado por busca, mesma lacuna já documentada nas etapas
anteriores desta sessão). Verificação é `npx tsc --noEmit` + checagem
manual no navegador (login como cliente vendedor e como cliente não
vendedor, conferir os dois caminhos).
