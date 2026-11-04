# Promoções — pedido do parceiro com aprovação do admin (Etapa 7)

## Contexto

Etapa 7 do roadmap do parceiro. A tabela `promotions` e toda a curadoria
de promoções já existem em produção — mas só o admin cria (sempre já
`is_approved=true`, o próprio código documenta isso: *"não existe fluxo
de submissão de promoção pelo parceiro no projeto"*
(`app/api/admin/offers/[planId]/promotions/route.ts`). Esta etapa fecha
essa lacuna: o dono de um app pede um desconto pro próprio plano, o
admin aprova (aplica de verdade, fica visível na home) ou rejeita (com
motivo). A sub-página "Ofertas e promoções"
(`/dashboard/financeiro/ofertas`), stub desde a Etapa 2, ganha dado
real.

## Objetivo

Dono pede uma promoção (desconto %, ou preço fixo, período, limite de
unidades opcional, elegibilidade pra "daily deals" opcional) pro próprio
plano. Fica invisível pra qualquer comprador até o admin aprovar. Admin
revisa numa fila dedicada (mesmo padrão da Etapa 5 "Preços"), aprova ou
rejeita com motivo. Dono vê o status (pendente/rejeitado com motivo) na
aba Ofertas e promoções; uma vez aprovada, a promoção aparece como
qualquer outra na tela de detalhe da oferta do admin
(`/admin/marketplace/ofertas/[offerId]`) e na home pra compradores.

## Decisão de arquitetura: reaproveita `promotions`, não cria tabela nova

`promotions.is_approved` (default `false`) já existe, nunca usado pra
isso — e a home (`app/page.tsx`) já filtra
`.eq('is_approved', true).eq('is_active', true)` pra decidir o que
mostrar pro público. Um pedido do parceiro é só um `INSERT` em
`promotions` com `is_approved=false` — **zero efeito visível** até
aprovar, a mesma proteção que a Etapa 6 construiu numa tabela nova, já
existe aqui e já está em produção há semanas. `getPromotionStatus()`
(`lib/services/offers.ts`) já trata `is_approved=false` como status
`'rascunho'` — reaproveitado tal como está, sem mudar essa função
compartilhada.

## Não-objetivos

- **`internal_note`**: continua campo só do admin (preenchido/editado
  na aprovação, nunca pedido pelo parceiro) — o nome já diz "interno".
- **Mudar `getPromotionStatus()`/`checkPromotionOverlap()`**: ambas já
  fazem exatamente o que esta etapa precisa (status `'rascunho'` pra
  não aprovada; sobreposição de datas já considera qualquer promoção
  não cancelada, pendente incluída) — reaproveitadas sem alteração.
- **Escopo por app individual na visibilidade do admin**: a nova fila
  de aprovação mostra pedidos de todos os parceiros, mesmo padrão já
  usado em `/admin/marketplace/precos`.
- **Edição de uma promoção já aprovada pelo parceiro**: pausar/cancelar/
  reativar uma promoção aprovada continua ação exclusiva do admin
  (`PATCH /api/admin/offers/promotions/[promotionId]`, já existe,
  intocado) — o parceiro só *pede*, nunca edita depois de aprovado.

## Schema — 4 colunas novas em `promotions`

```sql
alter table public.promotions
  add column if not exists created_by      uuid references auth.users(id) on delete set null,
  add column if not exists rejected_at     timestamptz,
  add column if not exists rejected_by     uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason text;
```

`created_by`: quem pediu — toda linha criada pelo admin (`is_approved`
já nasce `true`) ou pelo parceiro (nasce `false`) grava quem fez.
`rejected_*`: só usado quando o admin rejeita um pedido pendente —
diferente de `cancelled_*` (que é pra uma promoção **já aprovada** que
o admin decide encerrar antes do previsto, ação já existente e
intocada).

### RLS novas

Hoje só existem: leitura pública (aprovada+ativa+na janela) e
`is_technician()` com acesso total (select/insert/update/delete). Não
existe nenhuma policy deixando o dono do app ver ou criar seus próprios
pedidos — precisa de duas novas, mesmo padrão de posse já usado em toda
etapa anterior (via `plan_id` → `app_plans` → `app_drafts.created_by`):

```sql
create policy "owner_select_own_promotions" on public.promotions
  for select to authenticated
  using (
    exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = plan_id and d.created_by = auth.uid()
    )
  );

create policy "owner_insert_own_promotions" on public.promotions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and is_approved = false
    and is_active = false
    and exists (
      select 1 from public.app_plans p
      join public.app_drafts d on d.id = p.app_draft_id
      where p.id = plan_id and d.created_by = auth.uid()
    )
  );
```

`with check (is_approved = false and is_active = false)` impede o
parceiro de se auto-aprovar inserindo já ativo — mesmo princípio de
"nenhuma policy de UPDATE pro dono" da Etapa 6, mas aqui expresso no
próprio `INSERT`. Nenhuma policy de UPDATE pro dono (aprovar/rejeitar
continua exclusivo do admin, via rota que já teria que usar
service-role do mesmo jeito que Preços — reaproveitar
`createAdminClient()`).

## Fluxo

### 1. Parceiro pede — nova rota `POST /api/apps/plans/[planId]/promotions`

Espelha a validação da rota admin equivalente
(`app/api/admin/offers/[planId]/promotions/route.ts`) — mesmos campos
(`discountPercent` OU `promoPrice`, `startsAt`, `endsAt`, `timezone`,
`unitLimit`, `eligibleForDailyDeals` — sem `internalNote`), reaproveita
`computePromoPriceFromPercent`/`roundCents`/`checkPromotionOverlap` de
`lib/services/offers.ts` sem reimplementar a conta. Diferenças:
- Checagem de posse via `app_drafts.created_by = user.id` (mesmo padrão
  do `PATCH /api/apps/plans/[id]`), não `role='technician'`.
- **No máximo 1 pedido pendente (`is_approved=false`, sem
  `cancelled_at`/`rejected_at`) por plano por vez** — mesma regra da
  Etapa 6, checada explicitamente antes do insert (`checkPromotionOverlap`
  cobre sobreposição de *datas*, não "já existe QUALQUER pendente" —
  precisa das duas checagens).
- Insert final: `is_approved: false, is_active: false, created_by:
  user.id` (nunca `true` — a diferença central da rota admin).

### 2. Admin revisa — nova aba "Promoções" em `/admin/marketplace/promocoes`

Mesma estrutura da Etapa 6 (`/admin/marketplace/precos`): seção
"Pendentes" (linha por pedido: app, plano, parceiro, desconto %/preço
de→pra, período, botões Aprovar/Rejeitar) + "Histórico" (aprovados +
rejeitados, com motivo quando rejeitado). `NAV_TABS` ganha "Promoções"
nos mesmos 9 arquivos que já têm o array (8 + o próprio
`PromocoesClient.tsx` novo).

- **Aprovar**: `UPDATE promotions SET is_approved=true, is_active=true`
  — reaproveita `checkPromotionOverlap` mais uma vez antes de aplicar
  (o período pode ter ficado inválido/sobreposto desde o pedido, ex:
  admin criou outra promoção pro mesmo plano nesse meio-tempo) — se
  houver conflito agora, rejeita a aprovação com 409 em vez de aplicar
  uma sobreposição. Loga em `app_admin_events`
  (`action: 'create_promotion'`, mesmo padrão já usado pela criação
  direta do admin).
- **Rejeitar**: exige motivo (`rejection_reason`), `UPDATE promotions
  SET is_approved=false` (continua `false`, já era), `rejected_at`,
  `rejected_by`. Nunca aplica nada em `app_plans`/preço nenhum — é só a
  própria linha de `promotions` que muda.
- Ambas as rotas: compare-and-swap (`.eq('is_approved', false).is(
  'rejected_at', null).is('cancelled_at', null)` na condição do
  `UPDATE`, checar linha afetada) — mesma lição da review final da
  Etapa 6 sobre resolver pedido concorrente sem trava.

### 3. Parceiro vê o status — `/dashboard/financeiro/ofertas`

Lista as promoções (pendentes, rejeitadas com motivo, aprovadas/ativas)
dos planos do parceiro, usando `getPromotionStatus()` já existente pra
status/cor — só a cópia de pendente ganha um rótulo mais claro que
"Rascunho" nesta tela específica ("Aguardando aprovação"), sem tocar na
função compartilhada (ela continua dizendo "Rascunho" na tela do admin,
onde já é usada e testada). Botão "Pedir promoção" abre um formulário
(desconto %, datas, limite de unidades opcional, elegível pra daily
deals opcional) — mesmos campos da rota em (1).

## Erros e casos de borda

- **Admin cria uma promoção pro mesmo plano enquanto o pedido do
  parceiro está pendente**: a rota de aprovação roda
  `checkPromotionOverlap` de novo no momento de aprovar — se agora
  colide, rejeita a aprovação com 409 claro em vez de empurrar uma
  sobreposição pra produção.
- **Preço regular do plano muda entre o pedido e a aprovação** (ex: uma
  mudança de preço da Etapa 6 foi aprovada nesse meio-tempo): o pedido
  de promoção guardou `original_price` no momento do pedido — ao
  aprovar, se `promo_price >= preço atual do plano` (não mais o
  `original_price` congelado), a aprovação é recusada com um erro claro
  pedindo pro parceiro refazer o pedido com o preço atual — nunca
  aprova um "desconto" que virou preço igual ou maior que o atual.
- **Segundo pedido pendente pro mesmo plano**: bloqueado antes do
  insert, 409, mesma mensagem padrão.

## Testes

Mesma lacuna de cobertura automatizada documentada em toda etapa
anterior. Verificação: `npx tsc --noEmit` + checagem manual (parceiro
pede promoção, plano continua sem desconto na home; tentar pedir de
novo antes de resolver → bloqueado; admin vê o pedido na fila, rejeita
com motivo, parceiro vê o motivo; parceiro pede de novo, admin aprova,
promoção aparece na home dentro do período e no detalhe da oferta do
admin com o status certo).
