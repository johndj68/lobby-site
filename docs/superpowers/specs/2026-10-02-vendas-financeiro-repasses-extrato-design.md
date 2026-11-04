# Vendas e financeiro — Repasses e extrato com dados reais (Etapa 4)

## Contexto

Etapa 4 do roadmap da área "Vendas e financeiro" do parceiro (pedido do
usuário de 2026-10-01, que pedia explicitamente prazo real de repasse,
"não vamos presumir que sejam 136 dias"). Etapas 1-3 já em produção:
auditoria/snapshot de prazos, entrada no dashboard, Visão geral e Vendas
com dado real. Esta etapa troca o placeholder de
`/dashboard/financeiro/repasses` por: (1) a fila do que ainda falta
liberar, com o prazo exato de cada venda — nunca um número presumido; e
(2) o extrato de repasses já confirmados, com drill-down de quais vendas
cada um cobriu.

## Objetivo

O parceiro abre "Repasses e extrato" e vê, sem precisar calcular nada:
quais vendas ainda estão retidas e exatamente quando cada uma libera;
quais já estão elegíveis e aguardando o próximo repasse; e o histórico
completo de repasses já recebidos, cada um com as vendas que ele cobriu.

## Não-objetivos

- **Solicitar/registrar repasse**: continua sendo uma ação do líder, via
  `/admin/marketplace/repasses` (RPC `create_partner_payout`) — esta
  etapa é só leitura, o parceiro não aciona nada aqui.
- **Dados bancários/PIX do parceiro**: fica pra "Configurações de
  recebimento" (página stub separada, fora de escopo aqui).
- **Exportação/PDF do extrato**: fica pra uma etapa de relatórios, não
  faz parte daqui.
- **Paginação no histórico de repasses**: ao contrário da tabela de
  Vendas (potencialmente centenas de linhas), repasses são eventos raros
  — a lista completa sem paginação é suficiente (mesmo padrão já usado
  em `/admin/marketplace/repasses`, que também não pagina).

## Separação por fila (decisão do usuário)

Repasse principal (retenção de `retention_days`, hoje 16) e reserva de
disputa (`reserve_window_days`, hoje 120) têm prazos bem diferentes —
misturar as duas na mesma lista confundiria o parceiro sobre por que uma
venda "ainda retida" depois de 16 dias (quando na verdade é a reserva
que falta). A página tem **duas seções sempre visíveis**: "Repasse
principal" (soma `app_purchases` + `subscription_invoices`, exclui a
fatia de reserva) e "Reserva de disputa" (só `app_purchases`, já que
assinatura não tem reserva).

## Transparência do prazo (decisão do usuário)

Cada venda retida aparece com sua **data exata de liberação** (`paid_at
+ retention_days` ou `+ reserve_window_days`, conforme a fila) e os dias
restantes — nunca um resumo agregado escondendo o cálculo. Mesmo
princípio de transparência já usado na tabela de Vendas (Etapa 3).

## RPCs novas

Todas `security definer`, `set search_path to 'public'`,
auto-restritas a `partner_id = auth.uid()` (sem parâmetro
`p_partner_id`) — mesmo padrão da Etapa 3. Toda janela usa a coluna
snapshot da venda (`retention_days`/`reserve_window_days`), nunca um
literal fixo, exceto a perna de `subscription_invoices` (sem coluna de
snapshot, usa `interval '16 days'` fixo — mesma assimetria já existente
e já corrigida no restante do sistema, não uma nova inconsistência).
Toda RPC que lê `app_purchases`/`subscription_invoices` guarda
`paid_at is not null` explicitamente (lição da review final da Etapa 3
— toda RPC irmã já faz isso). Toda RPC recebe
`revoke execute ... from public, anon, authenticated` antes do
`grant ... to authenticated` (mesma correção aplicada retroativamente
nas RPCs da Etapa 3).

### 1. `get_partner_payout_queue_main()`

Vendas (compra única + fatura de assinatura) ainda não cobertas por
nenhum `partner_payout_items`/`partner_payouts.status='confirmado'`
(`kind='main'` pra `app_purchases`), **excluindo** compras totalmente
reembolsadas (`status='refunded'`) — não há nada a repassar ali.

```sql
returns table (
  sale_id         uuid,
  sale_kind       text,       -- 'app_purchase' | 'subscription_invoice'
  application_name text,
  plan_name       text,
  net_amount      numeric(12,2),  -- já líquido de comissão, reserva (se houver) e reembolso parcial
  paid_at         timestamptz,
  release_date    timestamptz,    -- paid_at + retention_days (ou 16 dias fixo p/ assinatura)
  days_remaining  integer,        -- greatest(0, ceil(dias até release_date)) — 0 quando já elegível
  status          text            -- 'retido' | 'elegivel'
)
```

### 2. `get_partner_payout_queue_reserve()`

Só `app_purchases`, `reserve_status = 'held'` (exclui `released` e
`clawed_back` — já saíram da fila, pagas ou perdidas).

```sql
returns table (
  sale_id          uuid,
  application_name text,
  plan_name        text,
  net_amount       numeric(12,2),  -- reserve_amount líquido de reembolso parcial proporcional
  paid_at          timestamptz,
  release_date     timestamptz,    -- paid_at + reserve_window_days
  days_remaining   integer,
  status           text            -- 'retido' | 'elegivel'
)
```

### 3. `get_partner_payout_history()`

Uma linha por **item** de repasse (não por repasse) — o client agrupa
por `payout_id` pra montar o drill-down, mesmo padrão de linha
expansível já usado na tabela de Vendas. `LEFT JOIN` nos itens (nunca
`INNER`) pra um repasse sem item nenhum (não deveria existir, mas é
defensivo) ainda aparecer. Inclui repasses **revertidos** também
(`status='revertido'`) — transparência do histórico completo, nunca
esconder um estorno.

```sql
returns table (
  payout_id       uuid,
  reference       text,
  notes           text,
  payout_status   text,        -- 'confirmado' | 'revertido'
  total_amount    numeric(12,2),
  created_at      timestamptz,
  reverted_at     timestamptz,
  revert_reason   text,
  item_id         uuid,
  item_kind       text,        -- 'app_purchase_main' | 'app_purchase_reserve' | 'subscription_invoice'
  item_amount     numeric(12,2),
  application_name text,
  plan_name       text,
  sale_paid_at    timestamptz
)
```

## UI

### `app/dashboard/financeiro/repasses/page.tsx` (Server Component)

Busca as 3 RPCs em paralelo (`Promise.all`), trata erro de cada uma
(mesma lição da Etapa 3: nunca cair silenciosamente num estado vazio em
falha de RPC — mostra mensagem de erro distinta). Passa os 3 resultados
pro Client Component.

### `RepassesClient.tsx` (novo, Client Component)

Três blocos, nesta ordem:

1. **Repasse principal** — cada venda retida/elegível em um card/linha
   compacta: app, plano, valor líquido, "Libera em N dias (DD/MM)" (ou
   badge "Elegível agora" quando `days_remaining = 0`). Ordenado por
   `release_date` crescente (a mais próxima de liberar primeiro).
   Estado vazio: "Nenhuma venda retida ou elegível no momento."

2. **Reserva de disputa** — mesmo layout, dados de
   `get_partner_payout_queue_reserve`. Estado vazio: "Nenhuma reserva de
   disputa em aberto."

3. **Histórico de repasses** — lista de repasses (agrupados a partir das
   linhas de `get_partner_payout_history`), mais recente primeiro.
   Repasse revertido mostra um badge distinto ("Revertido") e o motivo.
   Clique expande (mesmo padrão `Fragment`+`key` da tabela de Vendas) e
   mostra cada venda coberta (app, plano, tipo — principal/reserva/
   assinatura, valor, data da venda). Estado vazio: "Nenhum repasse
   recebido ainda."

Cores/badges reaproveitam a mesma paleta já estabelecida na Vendas
(Etapa 3): `#F59E0B` retido, `colors.primary` elegível, `#10B981`
confirmado/liberado, `#EF4444` revertido.

## Identidade visual

Mesmos tokens já em uso nas outras páginas da área (`colors.card`,
`colors.border`, `colors.textSecondary`, `formatCurrencyBRL`,
`formatDateBR` de `lib/finance.ts`) — nenhum token novo.

## Erros e casos de borda

- **Parceiro sem nenhuma venda retida/elegível/repasse**: os 3 estados
  vazios aparecem normalmente, nenhum erro.
- **Falha em qualquer uma das 3 RPCs**: mensagem de erro específica no
  bloco afetado, sem derrubar os outros dois blocos (cada
  `Promise.all` result tratado independentemente, não um try/catch
  único que esconde qual das três falhou).
- **Repasse revertido**: aparece no histórico com o motivo
  (`revert_reason`), e as vendas que ele cobria voltam a aparecer na
  fila de "Repasse principal"/"Reserva de disputa" (automático — a
  RPC de elegibilidade já exclui só itens de repasses `confirmado`, um
  revertido não bloqueia mais nada). Nenhuma lógica nova precisa tratar
  isso explicitamente, é consequência direta do filtro já existente.
- **`days_remaining` fracionário**: arredondado pra cima (`ceil`) —
  mostrar "1 dia" em vez de "0 dias" enquanto ainda falta uma fração de
  dia é mais honesto que sugerir que já liberou.

## Testes

Mesma lacuna já documentada nas etapas anteriores — sem teste
automatizado novo pra `app/dashboard/**`. Verificação: `npx tsc
--noEmit` + checagem manual no navegador com dados de teste cobrindo
pelo menos: 1 venda retida (fila principal), 1 elegível (fila
principal), 1 com reserva retida, 1 repasse confirmado com 1+ item
(conferir drill-down), 1 repasse revertido (conferir que a venda coberta
volta a aparecer na fila).
