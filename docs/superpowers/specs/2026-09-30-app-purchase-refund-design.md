# Reembolso de compra de app (via Stripe) + ajuste de retenção de repasse

## Contexto

Hoje `app_purchases` não tem nenhum caminho de reembolso real. O webhook
`charge.refunded` (`app/api/stripe/webhook/route.ts`) só trata
`campaign_purchases` e `credit_purchases`. Existe um modal genérico
(`RefundFinanceTransactionModal`) que reembolsa qualquer linha de
`financial_transactions` — mas para uma linha `type='app'` isso só toca a
fatia de comissão da LOBBY (o que foi lançado como receita própria), nunca
chama o Stripe, não mexe em `app_purchases`, não revoga o acesso do
comprador e não ajusta o que o parceiro vai receber no repasse. Usar esse
modal numa venda de app hoje produz um estado incoerente: ledger interno diz
"reembolsado", mas o cliente nunca recebeu o dinheiro de volta no cartão.

Decisão de negócio confirmada pelo usuário (2026-09-30): reembolso de venda
de app só pode ser pedido dentro de **15 dias** do pagamento. O repasse ao
parceiro só fica elegível a partir de **16 dias** (retenção). Por construção,
essas duas janelas nunca se sobrepõem — uma venda nunca está
simultaneamente "ainda reembolsável" e "elegível pra repasse". Isso elimina
qualquer necessidade de clawback (descontar de um parceiro que já recebeu):
esse caso nunca acontece.

Escopo desta leva: só `app_purchases` (compra avulsa de app). Reembolso de
`subscription_invoices` (assinatura recorrente de app_plan) fica para um
próximo spec.

## Objetivo

Dar ao Técnico Líder um jeito completo de reembolsar uma compra de app —
parcial ou total — que: chama o Stripe de verdade, é confirmado
exclusivamente pelo webhook (fonte de verdade é sempre `charge.amount_refunded`
do Stripe, nunca calculado localmente), revoga o acesso do comprador quando o
reembolso é total, mantém a fatia de comissão da LOBBY em
`financial_transactions` coerente, e garante que o repasse ao parceiro (peça
já existente) nunca pague a fatia que foi devolvida ao cliente.

## Não-objetivos

- Reembolso de `subscription_invoices` (fica para depois).
- Qualquer mecanismo de cobrança retroativa de parceiro que já recebeu
  repasse — por construção das janelas (15d reembolso / 16d repasse), esse
  caso não existe.
- Reembolso iniciado pelo comprador (self-service) — continua sendo o líder
  quem aciona, mesmo padrão de `credit_purchases`/e-book/campanha.

## Schema — `app_purchases`

Novas colunas, mesmo padrão já usado em `credit_purchases`
(`20260927170000_reembolso_parcial.sql`):

```sql
alter table public.app_purchases
  add column if not exists refund_status   text,
  add column if not exists refunded_amount numeric(12,2) not null default 0,
  add column if not exists refund_reason   text,
  add column if not exists refunded_at     timestamptz,
  add column if not exists refunded_by     uuid references auth.users(id);

alter table public.app_purchases
  add constraint app_purchases_refund_status_check
  check (refund_status is null or refund_status = any (array['processing', 'refunded']));

alter table public.app_purchases
  add constraint app_purchases_refunded_amount_check
  check (refunded_amount >= 0 and refunded_amount <= amount);
```

`commission_amount` e `partner_amount` **não são tocados** por reembolso —
continuam snapshot imutável do momento da venda (já documentado assim no
schema atual; mexer neles quebraria o CHECK
`commission_amount + partner_amount = amount`). O valor líquido a repassar
ao parceiro é *derivado* na hora do repasse (ver seção "Elegibilidade de
repasse"), não persistido.

`status` continua usando o valor `'refunded'` que já existe no CHECK
original — só muda para lá quando `refunded_amount >= amount` (reembolso
total). Reembolso parcial mantém `status='paid'`.

## Janela de 15 dias + retenção de 16 dias

- `PAYOUT_RETENTION_DAYS` (`lib/services/payouts.ts`): `14` → **`16`**.
- `create_partner_payout` (função com assinatura de 5 parâmetros, definida em
  `20260927240000_repasse_assinatura.sql`, que substituiu a de
  `20260927200000_repasse_parceiro.sql`): as duas checagens de elegibilidade
  (`app_purchases` e `subscription_invoices`) trocam
  `interval '14 days'` por `interval '16 days'`.
- Nova RPC `refund_app_purchase` rejeita a solicitação se
  `now() - paid_at > interval '15 days'`.

Resultado: dia 0–15 a venda pode ser reembolsada; a partir do dia 16 ela
pode entrar num repasse. Nunca os dois ao mesmo tempo.

## RPC `refund_app_purchase`

```sql
create or replace function public.refund_app_purchase(
  "p_purchase_id" uuid,
  "p_amount"       numeric,
  "p_reason"       text
)
returns public.app_purchases
language plpgsql security definer
set search_path to 'public'
as $$
declare
  purchase public.app_purchases;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode solicitar reembolso.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Informe o motivo do reembolso.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Valor de reembolso inválido.';
  end if;

  select * into purchase from public.app_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Compra não encontrada.';
  end if;
  if purchase.status <> 'paid' then
    raise exception 'Só é possível reembolsar uma compra paga.';
  end if;
  if purchase.refund_status = 'processing' then
    raise exception 'Já existe um reembolso em andamento para esta compra — aguarde a confirmação antes de pedir outro.';
  end if;
  if purchase.paid_at is null or purchase.paid_at <= now() - interval '15 days' then
    raise exception 'Fora do prazo de reembolso — só é possível solicitar até 15 dias após o pagamento.';
  end if;
  if p_amount > (purchase.amount - purchase.refunded_amount) then
    raise exception 'Valor maior que o saldo ainda reembolsável (R$ %).', (purchase.amount - purchase.refunded_amount);
  end if;

  update public.app_purchases
    set refund_status   = 'processing',
        refunded_amount = purchase.refunded_amount + p_amount,
        refund_reason   = p_reason,
        refunded_by     = auth.uid(),
        updated_at      = now()
    where id = p_purchase_id
    returning * into purchase;

  return purchase;
end;
$$;

revoke execute on function public.refund_app_purchase(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.refund_app_purchase(uuid, numeric, text) to authenticated;
```

Estado `refunded_amount` gravado aqui é otimista (igual ao padrão de
créditos) — o webhook confirma com o valor real do Stripe depois.

## Rota admin

`app/api/admin/app-purchases/[purchaseId]/refund/route.ts` — mesmo formato
de `app/api/admin/credit-purchases/[purchaseId]/refund/route.ts`:

1. Verifica sessão + `is_leader`.
2. Valida `amount`/`reason` no corpo.
3. Busca a compra (`status`, `amount`, `refunded_amount`, `refund_status`,
   `paid_at`, `stripe_payment_intent_id`).
4. Rejeita cedo (sem chamar Stripe) se: não `status='paid'`, sem
   `stripe_payment_intent_id`, `refund_status='processing'`, fora da janela
   de 15 dias, ou `amount` > saldo reembolsável — mesmas mensagens da RPC,
   feedback mais rápido pro líder.
5. Chama `stripe.refunds.create({ payment_intent, amount: Math.round(amount * 100) })`.
6. Se o Stripe aceitar, chama a RPC `refund_app_purchase`. Se a RPC falhar
   depois do Stripe já ter aceitado, devolve erro claro pedindo conferência
   manual (mesmo texto/postura da rota de créditos) — nunca finge sucesso
   total nem tenta desfazer o refund no Stripe.

## Webhook — `handleChargeRefunded`

Terceiro branch, depois de `campaign_purchases` e `credit_purchases`:
busca `app_purchases` por `stripe_payment_intent_id`. Se
`refund_status === 'refunded'` já (redelivery), sai sem fazer nada.

```
amountRefundedTotal = charge.amount_refunded / 100   -- verdade do Stripe, sempre cumulativo
fullyRefunded = amountRefundedTotal >= purchase.amount
```

Atualiza:
- `refunded_amount = amountRefundedTotal`
- `refund_status = fullyRefunded ? 'refunded' : null` (parcial confirmado
  volta a `null`, destrava novo pedido parcial futuro — mesmo padrão de
  `credit_purchases`)
- `refunded_at = fullyRefunded ? now() : null`
- `status = fullyRefunded ? 'refunded' : status` (mantém `'paid'` se
  parcial — acesso continua liberado)

Em seguida, atualiza a linha correspondente em `financial_transactions`
(`source_type='app_purchases'`, `source_id=purchase.id`): calcula a fatia de
comissão a reembolsar proporcionalmente
(`purchase.commission_amount * (amountRefundedTotal / purchase.amount)`,
arredondado) e grava em `refunded_amount` daquela linha, com `status`
virando `'reembolsado'` só quando cobrir o total da linha — reaproveita a
coluna genérica já criada em `20260927170000_reembolso_parcial.sql`, sem
schema novo ali.

Acesso: `get_my_app_purchase_access` já exige `status='paid'` — reembolso
total (que muda `status` para `'refunded'`) revoga automaticamente, sem
flag extra. Reembolso parcial não mexe em `status`, acesso continua.

## Elegibilidade de repasse (`create_partner_payout`)

A soma de `partner_amount` na checagem de elegibilidade de `app_purchases`
passa a descontar a fatia proporcional já reembolsada:

```sql
select count(*), coalesce(sum(
    ap.partner_amount - round(ap.refunded_amount * ap.partner_amount / ap.amount)
  ), 0)
  into v_app_valid_count, v_app_total
from public.app_purchases ap
where ap.id = any(p_app_purchase_ids)
  and ap.partner_id = p_partner_id
  and ap.status = 'paid'
  and ap.paid_at is not null
  and ap.paid_at <= now() - interval '16 days'
  and not exists (...)
```

(Reembolso total já teria `status <> 'paid'`, então nem entra na lista —
essa fórmula só importa pro caso parcial, onde `status` continua `'paid'`.)
`partner_payout_items.amount` inserido no repasse passa a usar esse mesmo
valor líquido, não `ap.partner_amount` bruto.

## UI

Novo `components/admin/finance/RefundAppPurchaseModal.tsx` — mistura os dois
padrões existentes: layout/copy do `RefundEbookPurchaseModal.tsx`, campo de
valor (parcial) do `RefundFinanceTransactionModal.tsx`. Mostra
nome do app/plano, comprador, valor pago, já reembolsado (se houver), saldo
reembolsável, e um aviso se a compra já passou dos 15 dias (desabilita o
botão de confirmar em vez de deixar o usuário descobrir só depois do erro
da RPC).

Ponto de entrada: `/admin/financeiro`, na listagem de lançamentos — para uma
linha `type='app'`, troca a ação "reembolsar lançamento" (que hoje abre o
`RefundFinanceTransactionModal` genérico, incompleto para esse caso) por
esta, que resolve a compra de origem via `source_type`/`source_id` e abre o
modal novo.

## Erros e casos de borda

- **Fora da janela de 15 dias**: rota e RPC recusam com mensagem clara;
  modal desabilita preventivamente quando já sabe a idade da compra.
- **Reembolso concorrente**: `refund_status='processing'` trava novo pedido
  até o webhook confirmar; RPC usa `FOR UPDATE`.
- **Redelivery do webhook**: idempotente — recheca `refund_status` antes de
  agir, mesmo padrão já usado em todos os outros handlers desse arquivo.
- **RPC falha após Stripe aceitar**: rota devolve erro explícito pedindo
  conferência manual — o webhook `charge.refunded` ainda vai chegar depois e
  corrigir o estado local sozinho.
- **App sem `partner_id` (app da própria LOBBY)**: `commission_amount = amount`
  inteiro, `partner_amount = 0` — fórmula de elegibilidade de repasse nunca
  entra em jogo pra essas (não existe parceiro pra repassar), reembolso
  funciona normalmente.

## Testes

- RPC `refund_app_purchase`: happy path parcial e total; rejeição fora da
  janela de 15 dias; rejeição com `refund_status='processing'` já ativo;
  rejeição de valor acima do saldo; rejeição de não-líder.
- Webhook: parcial confirmado libera novo pedido (`refund_status` volta a
  `null`); total confirmado revoga acesso (`get_my_app_purchase_access`
  passa a falhar); redelivery não duplica `refunded_amount`.
- `create_partner_payout`: venda com reembolso parcial dentro da janela de
  16 dias entra no repasse só pelo valor líquido; venda com reembolso total
  não aparece como elegível (status≠'paid').
