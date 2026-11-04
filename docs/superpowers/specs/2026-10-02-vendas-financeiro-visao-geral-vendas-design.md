# Vendas e financeiro — Visão geral e Vendas com dados reais (Etapa 3)

## Contexto

Etapa 3 do roadmap da área "Vendas e financeiro" do parceiro (pedido do
usuário de 2026-10-01). Etapas 1 (auditoria + snapshot de prazos) e 2
(entrada no dashboard — sidebar, guarda de vendedor, 5 páginas stub) já
estão em produção. Esta etapa troca os placeholders das páginas **Visão
geral** (`/dashboard/financeiro`) e **Vendas** (`/dashboard/financeiro/
vendas`) por dado real, derivado das tabelas e RPCs que o roadmap
financeiro (repasse, reembolso, reserva de disputa, snapshot de prazos)
já implementou.

## Objetivo

Visão geral: 6 cards com os números reais de quanto o parceiro tem
retido, elegível pra repasse, já repassado, em reserva de disputa, e o
resumo do mês atual (vendas e reembolsos). Vendas: tabela paginada de
toda venda do parceiro (compra única + fatura de assinatura), com filtro
por app e linha expansível mostrando o detalhe financeiro completo de
cada venda.

## Não-objetivos

- **Visibilidade por membro de equipe**: as duas RPCs novas filtram por
  `partner_id = auth.uid()` (app_purchases/subscriptions) — o mesmo
  "dono" que a RPC `create_partner_payout` já usa. Um membro de equipe
  que não seja esse dono passa pela guarda de vendedor da Etapa 2 (que
  usa `app_drafts`, owner OU membro) mas vê os cards/tabela vazios. Gap
  conhecido, decisão já tomada no roadmap: permissão granular de equipe
  é Etapa 5, não resolvida aqui.
- **Reembolso/reserva de disputa pra assinatura**: `subscription_invoices`
  não tem `refunded_amount` nem `reserve_amount`/`reserve_status` — esses
  mecanismos foram implementados (decisão do usuário, 2026-09-30) só pra
  `app_purchases`. O card de reembolsos do mês e a reserva retida somam
  só `app_purchases`; isso é reflexo do schema real, não uma omissão
  desta etapa.
- **Exportação/relatório (CSV, extrato em PDF)**: fica pra uma etapa
  posterior do roadmap (relatórios/exports), não faz parte daqui.
- **Paginação por cursor**: com volume de vendas ainda baixo, a tabela
  usa `limit`/`offset` simples (padrão já usado em nenhuma outra tela do
  client dashboard hoje, mas é o desenho mais simples que atende —
  cursor fica pra se o volume justificar depois).
- **Mudança em `/admin/financeiro`**: nenhum arquivo deste spec toca lá.

## Fontes de dados (já existentes, nenhuma tabela nova)

- `app_purchases`: `amount`, `commission_amount`, `partner_amount`,
  `status`, `paid_at`, `refund_status`, `refunded_amount`, `refunded_at`,
  `reserve_amount`, `reserve_status`, `retention_days` (snapshot, hoje
  16), `application_name`, `plan_name`, `buyer_user_id`, `partner_id`.
- `subscriptions` + `subscription_invoices`: `subscriptions.partner_id`
  (só `product_type='app_plan'` tem parceiro — `mensalidade` nunca tem).
  `subscription_invoices.amount/commission_amount/partner_amount/paid_at`
  — sem campos de reembolso/reserva (não existem pra assinatura hoje).
- `partner_payout_items` (+ `partner_payouts.status='confirmado'`): cobre
  tanto `app_purchase_id` (com `kind` main/reserve) quanto
  `subscription_invoice_id` — é como uma venda específica sai de
  "elegível" pra "paga". Mesma tabela que `create_partner_payout` já
  escreve.
- `profiles`: nome/e-mail do comprador (`buyer_user_id` de app_purchases,
  `subscriptions.user_id` de assinatura) — **sem** política de RLS que
  deixe o parceiro ler o profile de outro usuário diretamente (dois bugs
  de recursão em `profiles` já aconteceram nesse projeto ao tentar
  policies correlacionadas — ver `20260704170000_fix_profiles_select_
  recursion.sql` e `20260715063400_fix_client_technician_read_
  recursion.sql`). Por isso o nome/e-mail do comprador é devolvido pela
  RPC (SECURITY DEFINER, já validando `partner_id = auth.uid()` antes de
  tocar `profiles`), igual ao padrão já usado em
  `get_my_app_purchase_access`, nunca por uma policy nova em `profiles`.

## RPCs novas

Todas `language plpgsql stable security definer set search_path to
'public'`, todas começam validando que quem chama é o parceiro (não
precisa `is_leader` — são dados do próprio usuário).

### 1. `get_partner_financeiro_overview()`

Sem parâmetros (sempre o parceiro logado, sempre todos os apps dele).
Retorna uma linha só:

```sql
returns table (
  retido_amount           numeric(12,2),
  elegivel_amount         numeric(12,2),
  repassado_amount        numeric(12,2),
  reserva_retida_amount   numeric(12,2),
  vendas_mes_count        integer,
  vendas_mes_amount       numeric(12,2),
  reembolsos_mes_count    integer,
  reembolsos_mes_amount   numeric(12,2)
)
```

Definição de cada campo (todo "líquido" já descontando reembolso
proporcional, mesma fórmula de `calculateAppPurchasePayoutAmounts` em
`lib/services/payouts.ts`, espelhada aqui em SQL):

- **`retido_amount`**: soma de `app_purchases` (`status='paid'`,
  `paid_at > now() - 16 days`, fatia principal líquida de reembolso,
  **excluindo** a reserva) + `subscription_invoices`
  (`paid_at > now() - 16 days`, `partner_amount` cheio — sem reserva pra
  assinatura) que ainda **não** estão cobertas por nenhum
  `partner_payout_items`/`partner_payouts.status='confirmado'`. Mesma
  janela de 16 dias e mesmo filtro de "não coberto" que
  `create_partner_payout` usa pra decidir elegibilidade — só que aqui
  pega o lado "ainda dentro da janela" em vez de "já fora".
- **`elegivel_amount`**: igual ao anterior, mas `paid_at <= now() - 16
  days` (fora da janela, não coberto — exatamente o que
  `create_partner_payout` aceitaria repassar agora).
- **`repassado_amount`**: soma de `partner_payout_items.amount` onde o
  `partner_payouts.status = 'confirmado'` e (`app_purchase_id` aponta pra
  uma compra deste parceiro com `kind IN ('main','reserve')`) ou
  (`subscription_invoice_id` aponta pra uma fatura deste parceiro) — todo
  o histórico, sem filtro de data.
- **`reserva_retida_amount`**: soma de `app_purchases.reserve_amount`
  líquido de reembolso proporcional, onde `reserve_status = 'held'`
  (ainda não liberada nem perdida em disputa). Só `app_purchases` — sem
  equivalente em assinatura.
- **`vendas_mes_count`/`vendas_mes_amount`**: contagem e soma de
  `amount` bruto de `app_purchases` (`status='paid'`) +
  `subscription_invoices`, ambas com `paid_at` no mês corrente
  (`date_trunc('month', now())` até agora).
- **`reembolsos_mes_count`/`reembolsos_mes_amount`**: contagem e soma de
  `app_purchases.refunded_amount` onde `refunded_at` está no mês
  corrente. Assinatura não entra (sem mecanismo de reembolso).

### 2. `get_partner_sold_apps()`

```sql
returns table (application_id uuid, application_name text)
```

`DISTINCT` dos apps que o parceiro já vendeu — combina
`app_purchases.application_id/application_name` (dono = parceiro) com
`subscriptions.app_plan_id` → nome do plano via join em `app_plans`/
`applications` (já que `subscriptions` não guarda snapshot do nome do
app, só `plan_name` da assinatura em si — precisa do join, diferente de
`app_purchases` que já snapshotou `application_name`). Usado só para
popular o filtro dropdown da página Vendas.

### 3. `get_partner_sales(p_application_id uuid default null, p_limit int default 50, p_offset int default 0)`

Uma linha por venda (compra única OU ciclo de assinatura), ordenado por
`paid_at desc`, filtrado por `p_application_id` quando informado (ignora
o filtro quando `null`):

```sql
returns table (
  sale_id             uuid,       -- app_purchase_id ou subscription_invoice_id
  sale_kind           text,       -- 'app_purchase' | 'subscription_invoice'
  application_name    text,
  plan_name           text,
  buyer_name          text,
  buyer_email         text,
  amount              numeric(12,2),
  commission_amount   numeric(12,2),
  partner_amount      numeric(12,2),
  reserve_amount      numeric(12,2),   -- 0 pra subscription_invoice
  reserve_status      text,       -- 'held' | 'released' | 'clawed_back' | null (sem reserva/assinatura)
  refunded_amount     numeric(12,2),   -- 0 pra subscription_invoice
  paid_at             timestamptz,
  payout_status       text        -- 'retido' | 'elegivel' | 'pago' (fatia principal)
)
```

`payout_status` usa a mesma classificação de
`classifyPurchasePayoutStatus` (retenção de 16 dias + "coberto por
payout confirmado?"), calculada em SQL do mesmo jeito que as duas RPCs
acima. `buyer_name`/`buyer_email` vêm de `profiles.full_name`/`email` via
join interno na função (SECURITY DEFINER já validou que a linha
pertence a este parceiro antes de expor o profile do comprador — nunca
uma policy nova em `profiles`).

Contagem total pra paginação: uma 4ª RPC pequena
`get_partner_sales_count(p_application_id uuid default null)` retornando
`integer`, mesmo filtro, sem `limit`/`offset` — evita que o client tenha
que pedir `limit=999999` pra saber o total.

## UI

### Visão geral — `app/dashboard/financeiro/page.tsx`

Troca o Server Component placeholder por: chama
`get_partner_financeiro_overview()` no servidor, renderiza 6 cards (grid
responsivo, 2 colunas no mobile / 3 no desktop) com os tokens visuais já
usados (`colors.card`, `shadows.card`). Cada card: label + valor em BRL
(`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`) +
subtítulo curto explicando o que é (ex: "Retido — dentro dos 16 dias de
retenção"). Sem necessidade de client component — é leitura única no
load da página, sem interação.

### Vendas — `app/dashboard/financeiro/vendas/page.tsx` + novo
`VendasClient.tsx`

Server Component busca `get_partner_sold_apps()` (lista do filtro) e
passa pro Client Component, que:
- Dropdown "Todos os apps" + um item por app retornado.
- Ao trocar o filtro ou mudar de página, chama
  `supabase.rpc('get_partner_sales', {...})` +
  `get_partner_sales_count` do client, re-renderiza a tabela.
- Tabela: colunas App, Plano, Comprador (nome — ver privacidade abaixo),
  Data, Valor, Status (badge: retido=âmbar, elegível=azul, pago=verde).
  Clique na linha expande um painel inline com: valor bruto, comissão
  LOBBY, valor líquido do parceiro, reserva de disputa com seu status
  (retida/liberada/perdida em disputa — se houver), reembolso (se
  houver), tipo de venda (compra única / assinatura mensal/anual).
- Paginação: botões anterior/próxima + "X–Y de Z", `p_limit=50`.

**Privacidade do comprador**: nome e e-mail completos exibidos (decisão
do usuário) — vêm prontos da RPC `get_partner_sales`, sem chamada
adicional nem exposição de outras colunas de `profiles`.

## Erros e casos de borda

- **Parceiro sem nenhuma venda ainda**: os 6 cards mostram R$ 0,00 /
  "0 vendas este mês"; a tabela mostra estado vazio ("Nenhuma venda
  ainda") em vez de tabela em branco.
- **Assinatura cancelada no meio do período**: não afeta nada aqui —
  `subscription_invoices` só tem linha por ciclo já pago
  (`invoice.paid`), cancelamento futuro não desfaz fatura passada.
- **Reserva perdida em disputa (`reserve_status='clawed_back'`)**: não
  conta em `reserva_retida_amount` (só `held` conta) nem em
  `repassado_amount` (nunca foi pago) — simplesmente não aparece em
  nenhum dos cards de valor a receber, consistente com "LOBBY absorve,
  nunca paga" (comentário já existente na coluna).
- **Filtro de app sem nenhuma venda**: tabela mostra estado vazio
  filtrado, cards da Visão geral não mudam (sempre agregam todos os
  apps, filtro é só da tabela de Vendas).

## Testes

Sem teste automatizado novo pras páginas (mesma lacuna documentada nas
etapas anteriores — zero precedente de teste pra `app/dashboard/**`
neste projeto). As 3 RPCs novas (SQL, `security definer`) são testáveis
por `supabase db execute`/consulta manual — verificação é rodar cada uma
logada como o parceiro de teste e comparar contra os mesmos dados que as
páginas administrativas (`/admin/marketplace/repasses`,
`/admin/financeiro/contas`) já mostram pra garantir que os números
batem. Verificação final: `npx tsc --noEmit` + checagem manual no
navegador (criar vendas de teste — compra única e, se possível, uma
fatura de assinatura — e confirmar os 6 cards e a tabela/drill-down).
