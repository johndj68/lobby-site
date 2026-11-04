-- Reembolso de compra de e-book (gap 2/4 sinalizado depois do roadmap
-- principal). Etapa 1 (reembolso parcial) só cobriu credit_purchases e
-- financial_transactions genérico — ebook_purchases nunca ganhou reembolso
-- próprio, apesar de ter DOIS jeitos de ter sido pago (crédito ou manual
-- BRL) que reembolso genérico nenhum cobria os dois.
--
-- Sempre reembolso TOTAL, nunca parcial: e-book é bem digital indivisível,
-- não existe "metade do PDF" — diferente de crédito/financeiro geral, que
-- têm valor fracionável.
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra revisão
-- e `supabase db push` manual.

create or replace function public.refund_ebook_purchase(
  "p_purchase_id" uuid,
  "p_reason"       text
)
returns public.ebook_purchases
language plpgsql security definer
set search_path to 'public'
as $$
declare
  purchase public.ebook_purchases;
  ebook    public.resource_metadata;
begin
  if not public.is_leader(auth.uid()) then
    raise exception 'Somente Técnico Líder pode reembolsar compra de e-book.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Informe o motivo do reembolso.';
  end if;

  select * into purchase from public.ebook_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Compra não encontrada.';
  end if;
  if purchase.status <> 'paid' then
    raise exception 'Só é possível reembolsar uma compra paga.';
  end if;

  if purchase.payment_provider = 'credits' then
    -- Devolve os créditos gastos (redeem_credits_for_ebook debitou
    -- resource_metadata.credit_price na hora da compra) — mesmo padrão de
    -- add_credits já usado em toda concessão de crédito no projeto.
    select * into ebook from public.resource_metadata where id = purchase.ebook_id;
    if ebook.credit_price is not null and ebook.credit_price > 0 then
      perform public.add_credits(
        purchase.user_id, ebook.credit_price, 'refund',
        'Reembolso do e-book "' || coalesce(ebook.title, '—') || '": ' || p_reason,
        'ebook_purchases', purchase.id, auth.uid()
      );
    end if;
  else
    -- Compra manual (confirm_ebook_purchase_manual, Etapa 2) sempre lança
    -- um financial_transactions correspondente (source_type='ebook_purchases')
    -- — marca esse lançamento como totalmente reembolsado. Se por algum
    -- motivo não existir (linha legada), não há nada financeiro a reverter
    -- e o reembolso segue só revogando o acesso abaixo.
    update public.financial_transactions
      set refunded_amount = amount, status = 'reembolsado', updated_at = now()
      where source_type = 'ebook_purchases' and source_id = purchase.id and status = 'pago';
  end if;

  -- status <> 'paid' já basta pra revogar acesso: as telas de download
  -- (app/recursos, app/dashboard/downloads) só liberam o botão quando
  -- ebook_purchases.status = 'paid' — não precisa de flag extra.
  update public.ebook_purchases
    set status = 'refunded'
    where id = p_purchase_id
    returning * into purchase;

  return purchase;
end;
$$;

revoke execute on function public.refund_ebook_purchase(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_ebook_purchase(uuid, text) to authenticated;
