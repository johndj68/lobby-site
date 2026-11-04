-- Dados de recebimento do parceiro (gap sinalizado no roadmap, peça 4 —
-- repasse continuava 100% manual sem nenhum lugar pra guardar chave PIX/
-- conta bancária, forçando o líder a pedir isso fora do sistema toda vez).
--
-- Reaproveita profiles em vez de criar tabela nova — mesmo raciocínio já
-- documentado em lib/partners.ts: "o projeto não tem um modelo de
-- organização... parceiro é o profile dono de app_drafts". Esses campos
-- são só informativos (repasse continua manual, ninguém chama API de
-- banco/PIX com isso) — o líder lê aqui e faz a transferência por fora.
--
-- Sem policy nova: profiles já tem "own_profile_update" (auth.uid()=id),
-- e esses campos não são privilégio (role/is_leader), então a trigger de
-- escalação de privilégio não precisa saber deles.
--
-- NÃO APLICADA em produção por este agente — arquivo preparado pra revisão
-- e `supabase db push` manual.

alter table public.profiles
  add column if not exists payout_pix_key       text,
  add column if not exists payout_account_holder text,
  add column if not exists payout_notes          text;

comment on column public.profiles.payout_pix_key is
  'Chave PIX informada pelo parceiro pra receber repasse. Só informativo — repasse é manual (peça 4), ninguém chama API de banco com isso.';
comment on column public.profiles.payout_account_holder is
  'Nome do titular da conta/chave PIX — pode diferir de full_name (ex: conta PJ).';
comment on column public.profiles.payout_notes is
  'Texto livre pra instruções de recebimento fora do PIX (dados bancários pra TED, preferências, etc).';
