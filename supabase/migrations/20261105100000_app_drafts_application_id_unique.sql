-- Auditoria (2026-11-05): app_drafts.application_id é a ÚNICA fonte de
-- "quem é o dono" de uma linha em applications — a tabela applications não
-- tem coluna de dono nenhuma (nem created_by, nem developer_id). A FK era
-- nullable mas nunca "unique", então nada no banco impedia duas linhas de
-- app_drafts (de dois parceiros diferentes) apontarem pro mesmo
-- applications.id.
--
-- Combinado com o endpoint PATCH /api/apps/drafts/[id] aceitando
-- `application_id` direto do body (corrigido agora com allowlist de campos
-- no código), um parceiro conseguia apontar o PRÓPRIO rascunho pro
-- application_id de um app de outro parceiro ainda não publicado — e no
-- próximo clique de "Publicar" do admin, esse app alvo tinha seu conteúdo
-- sobrescrito e saía publicado com o nome do atacante.
--
-- O allowlist no PATCH já fecha o caminho de ataque conhecido hoje, mas
-- esta constraint é a trava real e duradoura: nenhum outro endpoint,
-- presente ou futuro, consegue recriar esse furo, porque o próprio banco
-- nunca aceita duas linhas de app_drafts com o mesmo application_id
-- (NULL continua permitido múltiplas vezes — só valores preenchidos
-- precisam ser únicos).

create unique index if not exists idx_app_drafts_application_id_unique
  on public.app_drafts (application_id)
  where application_id is not null;
