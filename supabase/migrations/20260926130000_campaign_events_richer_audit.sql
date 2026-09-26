-- =============================================
-- app_admin_events: 3 lacunas reais deixadas pela primeira versão da aba
-- Histórico (seção 9 do pedido de Histórico) — nunca eram tecnicamente
-- impossíveis de registrar, só não tinham coluna:
--
-- 1) field_changes  — antes/depois REAIS por campo em update_campaign_config
--    (antes só o nome do campo ia em `reason`, texto livre)
-- 2) creative_id    — vínculo real evento → versão do criativo, em vez de
--    associar por proximidade de horário (heurística, só usada agora como
--    fallback pra eventos legados sem essa coluna)
-- 3) internal_note  — nota interna do revisor, separada de `reason` (que já
--    era a mensagem enviada ao parceiro) — nunca exposta em endpoint/tela
--    de parceiro (só a rota /admin lê esta coluna)
-- =============================================

alter table public.app_admin_events
  add column if not exists creative_id uuid references public.ad_creatives(id) on delete set null,
  add column if not exists internal_note text,
  add column if not exists field_changes jsonb;

create index if not exists idx_app_admin_events_creative on public.app_admin_events(creative_id);

comment on column public.app_admin_events.field_changes is
  'Array [{"field","label","before","after"}] só em update_campaign_config a partir desta migration — eventos antigos ficam null (nunca reconstruídos).';
comment on column public.app_admin_events.internal_note is
  'Nota interna do revisor (ad_creatives.reviewer_notes no momento da decisão) — nunca exibir em tela/endpoint de parceiro.';
