-- Auditoria (2026-11-05): a rota de publicação (app/api/admin/apps/
-- [draftId]/publish) escrevia em applications e depois em app_drafts como
-- duas chamadas de rede separadas, não uma transação. Se o processo
-- morresse entre as duas (timeout, crash, deploy no meio), o app ficava
-- publicado e visível no catálogo, mas sem o link de volta em
-- app_drafts.application_id — um retry subsequente lia application_id
-- ainda nulo e criava uma SEGUNDA linha em applications pro mesmo draft:
-- listing duplicado/fantasma, a antiga órfã e inacessível por qualquer
-- tela administrativa (nenhuma UI lista applications sem draft dono).
--
-- Fix: as duas escritas (applications + app_drafts) e a revalidação de
-- conflito de application_id (mesma regra da migration anterior,
-- 20261105100000) agora vivem dentro de uma função plpgsql — uma falha em
-- qualquer parte reverte a transação inteira, nunca deixa a publicação
-- "pela metade". SECURITY INVOKER (padrão, sem "security definer"): corre
-- com o mesmo papel/RLS de quem chama, idêntico ao comportamento atual —
-- não eleva privilégio nenhum, só torna as duas escritas atômicas.

create or replace function public.publish_app_draft(
  p_draft_id          uuid,
  p_expected_status   text,
  p_application_id    uuid,
  p_slug              text,
  p_name              text,
  p_description       text,
  p_short_description text,
  p_category          text,
  p_category_id       uuid,
  p_developer_name    text,
  p_logo_url          text,
  p_preview_image_url text,
  p_price             numeric,
  p_price_currency    text,
  p_billing_period    text,
  p_is_free           boolean
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_application_id    uuid;
  v_conflicting_draft  uuid;
  v_rows               int;
begin
  if p_application_id is not null then
    -- Revalida dentro da MESMA transação: outro draft pode ter
    -- reivindicado esse application_id entre a checagem feita na rota
    -- (leitura solta, fora da transação) e esta chamada.
    select id into v_conflicting_draft
      from public.app_drafts
      where application_id = p_application_id and id <> p_draft_id
      limit 1;
    if v_conflicting_draft is not null then
      raise exception 'Este aplicativo já está vinculado a outro rascunho.';
    end if;

    update public.applications set
      name               = p_name,
      description        = p_description,
      short_description  = p_short_description,
      category           = p_category,
      category_id        = p_category_id,
      developer_name     = p_developer_name,
      logo_url           = p_logo_url,
      preview_image_url  = p_preview_image_url,
      price              = p_price,
      price_currency     = p_price_currency,
      billing_period     = p_billing_period,
      is_free            = p_is_free,
      is_published       = true,
      is_lobby_made      = false,
      suspended_at       = null,
      suspended_by       = null,
      suspended_reason   = null,
      updated_at         = now()
    where id = p_application_id;

    v_application_id := p_application_id;
  else
    insert into public.applications (
      name, description, short_description, category, category_id, developer_name,
      logo_url, preview_image_url, price, price_currency, billing_period, is_free,
      is_published, is_lobby_made, slug
    ) values (
      p_name, p_description, p_short_description, p_category, p_category_id, p_developer_name,
      p_logo_url, p_preview_image_url, p_price, p_price_currency, p_billing_period, p_is_free,
      true, false, p_slug
    )
    returning id into v_application_id;
  end if;

  -- Guard de status otimista: evita corrida se dois técnicos clicarem
  -- publicar ao mesmo tempo. Se 0 linhas mudarem, TODA a transação
  -- reverte — inclusive a escrita em applications acima, que é
  -- exatamente o ponto desta função existir.
  update public.app_drafts
    set status = 'published', application_id = v_application_id
    where id = p_draft_id and status = p_expected_status;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Não foi possível publicar agora — o status pode ter mudado em outra sessão. Recarregue e tente novamente.';
  end if;

  return jsonb_build_object('application_id', v_application_id);
end;
$$;

grant execute on function public.publish_app_draft(
  uuid, text, uuid, text, text, text, text, text, uuid, text, text, text, numeric, text, text, boolean
) to authenticated;
