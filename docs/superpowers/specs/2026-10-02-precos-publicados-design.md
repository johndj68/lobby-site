# Preços publicados — aprovação de mudança de preço (Etapa 6)

## Contexto

Etapa 6 do roadmap do parceiro. Auditoria encontrou uma lacuna real: hoje
`PATCH /api/apps/plans/[id]` deixa o dono do app mudar `price`/
`billing_period` de um plano **instantaneamente**, sem revisão, sem
histórico — inclusive em app já publicado, vendendo de verdade
(`app/dashboard/meus-app/novo/[appId]/planos/PlanosClient.tsx`, única
tela que toca esse endpoint). Esta etapa fecha essa lacuna: **toda**
mudança de preço/forma de cobrança num plano já existente passa a
exigir aprovação do admin antes de valer — decisão do usuário, mais
rigorosa que "só apps publicados" porque reduz risco desde o primeiro
dia do app no ar.

## Objetivo

Dono edita o preço/periodicidade de um plano existente → vira um pedido
pendente, o plano continua com o valor antigo até o admin aprovar.
Admin tem uma fila pra revisar, aprovar (aplica de verdade) ou rejeitar
(com motivo). Dono vê o status (pendente/aprovado/rejeitado) direto no
card do plano, onde já edita hoje — sem área nova no dashboard do
cliente.

## Não-objetivos

- **Preço inicial de plano novo**: criar um plano define o preço
  livremente — nada pra comparar/aprovar ainda. Só **editar** um plano
  que já existe entra na fila.
- **Outros campos do plano** (nome, descrição, features, users_limit,
  support_level): continuam edição livre e instantânea — só `price` e
  `billing_period` entram no gate.
- **Área "Vendas e financeiro"**: esta etapa não mexe em nenhuma das 5
  sub-páginas de lá (decisão do usuário) — o status do pedido fica no
  próprio card do plano, na aba "Oferta e planos" do fluxo de edição do
  app.
- **Permissão de equipe pra editar plano**: a rota `PATCH` hoje só
  aceita o dono literal (`app_drafts.created_by = user.id`), nunca
  membro de equipe mesmo com permissão `edit` — gap pré-existente, fora
  de escopo corrigir aqui.

## Modelo de dados

### Tabela nova — `plan_price_change_requests`

```sql
create table public.plan_price_change_requests (
  id                        uuid primary key default gen_random_uuid(),
  app_plan_id               uuid not null references public.app_plans(id) on delete cascade,
  requested_by              uuid not null references auth.users(id),
  status                    text not null default 'pendente'
                              check (status in ('pendente', 'aprovado', 'rejeitado')),
  current_price             numeric(10,2),
  requested_price           numeric(10,2) not null,
  current_billing_period    text,
  requested_billing_period  text not null,
  reviewed_by               uuid references auth.users(id),
  reviewed_at               timestamptz,
  review_notes              text,
  created_at                timestamptz not null default now()
);
```

`current_price`/`current_billing_period` são snapshot no momento do
pedido (o que o plano tinha antes) — pro admin comparar "de X pra Y"
sem precisar que o valor antigo ainda exista em lugar nenhum depois de
aprovado. Único índice parcial garantindo **no máximo 1 pedido
`pendente` por plano por vez** — evita empilhar pedidos conflitantes
pro mesmo plano:

```sql
create unique index plan_price_change_requests_one_pending_per_plan
  on public.plan_price_change_requests (app_plan_id)
  where status = 'pendente';
```

RLS: dono do app (via `app_plans.app_draft_id` → `app_drafts.created_by
= auth.uid()`) pode `select`/`insert` seus próprios pedidos — mesma
checagem de posse que `PATCH /api/apps/plans/[id]` já faz hoje, nunca
mais ampla. Admin (`is_leader`) pode `select` tudo e `update`
(aprovar/rejeitar) — dono nunca atualiza `status`/`reviewed_*` direto,
só via API admin.

## Fluxo

### 1. Dono edita preço de plano existente

`PATCH /api/apps/plans/[id]` muda de comportamento quando o payload
inclui `price` ou `billing_period` **diferente** do valor atual:
- Campos que NÃO são `price`/`billing_period` (nome, descrição,
  features, etc.) continuam aplicados direto no `UPDATE`, como hoje.
- Se `price`/`billing_period` mudaram: em vez de aplicar, insere uma
  linha em `plan_price_change_requests` (`status='pendente'`,
  snapshot do valor atual, valor pedido) e devolve isso na resposta —
  `app_plans.price`/`billing_period` **não mudam** até aprovação.
- Se já existe um pedido `pendente` pro mesmo plano: rejeita com 409
  ("Já existe um pedido de mudança de preço aguardando aprovação pra
  este plano.") — o dono precisa esperar a decisão anterior, não
  empilhar.

### 2. Admin revisa — nova página `/admin/marketplace/precos`

Nova aba na navegação do admin marketplace (mesmo padrão das existentes
— Ofertas, Repasses, etc.), listando pedidos `pendente` (+ filtro pra
ver histórico aprovado/rejeitado). Cada linha: app, plano, de quanto
pra quanto, quem pediu, quando. Ação aprovar (aplica
`price`/`billing_period` reais no `app_plans` + marca
`aprovado`/`reviewed_by`/`reviewed_at`) ou rejeitar (exige motivo em
`review_notes`, marca `rejeitado`, `app_plans` nunca muda).

### 3. Dono vê o status — card do plano em `PlanosClient.tsx`

Cada card de plano busca (ou recebe via server component) se há um
pedido não-finalizado/recente pra aquele `app_plan_id`:
- `pendente`: badge âmbar "Aguardando aprovação: R$X → R$Y".
- `rejeitado` (mostrado só até o dono abrir/reconhecer, ou
  indefinidamente — decisão simples: mostrar o rejeitado mais recente
  enquanto não houver um `pendente` mais novo pro mesmo plano):
  badge vermelho "Pedido rejeitado: R$X → R$Y — {motivo}".
- Sem pedido em aberto: nada muda, preço mostrado normalmente.
- Botão "Editar" continua abrindo o mesmo modal de edição — ao salvar
  com preço/periodicidade alterados, em vez de atualizar o card na
  hora, mostra o novo badge "Aguardando aprovação".

## Erros e casos de borda

- **Admin aprova, mas o plano foi deletado nesse meio tempo**: `UPDATE
  app_plans` afeta 0 linhas — API retorna erro claro, pedido continua
  `pendente` (não marca `aprovado` se o UPDATE de fato não aplicou
  nada). Checar `error`/linhas afetadas antes de marcar o pedido como
  resolvido.
- **Dois pedidos pendentes simultâneos pro mesmo plano**: impedido pelo
  índice único parcial — a segunda tentativa de INSERT falha, API
  traduz pra 409 com mensagem clara.
- **Preço pedido igual ao atual** (ex: usuário digitou o mesmo valor):
  não cria pedido nenhum — trata como "sem mudança", aplica o resto do
  payload (outros campos) normalmente, sem gerar ruído na fila do
  admin.

## Testes

Mesma lacuna de cobertura automatizada já documentada em toda a área de
dashboard deste projeto. Verificação: `npx tsc --noEmit` + checagem
manual (editar preço de um plano existente, confirmar que não muda na
hora e aparece pendente; aprovar como admin, confirmar que aplica;
criar outro pedido e rejeitar, confirmar que não aplica e mostra
motivo; tentar criar um segundo pedido pendente pro mesmo plano,
confirmar bloqueio).
