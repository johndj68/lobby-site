-- lib/validations/app-review.ts (calculateReview, já em produção via
-- /api/apps/[appId]/review/checklist e a tela de Revisão) já lê
-- draft.history e draft.faq pra decidir se as abas "História do produto" e
-- "Perguntas frequentes" estão preenchidas — só que essas colunas nunca
-- existiram em app_drafts. E a checagem de "Sinais de confiança" lê
-- draft.benefits, que é o MESMO campo usado por "Principais benefícios"
-- (bullets curtos da ficha básica) — dois conceitos diferentes colididos
-- na mesma coluna. Sem isso, três das seis abas do editor (item 10 da
-- tarefa) não têm onde persistir.
--
-- Aditivo: só adiciona colunas novas, não toca em nada existente.

alter table public.app_drafts
  add column if not exists history jsonb,        -- "História do produto" — [{title, description}]
  add column if not exists trust_signals jsonb,   -- "Sinais de confiança" — [{title, url}]
  add column if not exists faq jsonb;             -- "Perguntas frequentes" — [{question, answer}]
