-- Continuação da revisão de segurança: fix 2 do migration anterior
-- (20260717150858) não funcionou. Reteste ao vivo pós-fix mostrou
-- get_or_create_wallet AINDA chamável por qualquer client — e o mesmo
-- padrão de revoke em add_credits (que já existia desde o migration
-- original de créditos) tinha o MESMO furo, nunca testado até agora:
-- add_credits deixa mintar créditos pra QUALQUER user_id, sem nenhuma
-- checagem interna de autorização (confia inteiramente no revoke).
--
-- Causa raiz: `revoke execute ... from authenticated, anon` não basta.
-- Toda function nova no Postgres recebe EXECUTE pra role PUBLIC por
-- default; authenticated/anon são membros de PUBLIC, então revogar só
-- deles não remove o privilégio herdado via PUBLIC. Precisa revogar de
-- PUBLIC explicitamente.
--
-- Confirmado por exploit ao vivo ANTES deste fix:
--   - get_or_create_wallet(vitima.id) chamado pelo atacante: vazou saldo 500.
--   - add_credits(atacante.id, 999999, 'bonus', ...) chamado pelo atacante:
--     mintou 999999 créditos pra própria carteira (CRÍTICO).
--
-- spend_credits nunca teve nenhum revoke (nem o furado). Ela só mexe na
-- PRÓPRIA carteira (auth.uid()), não é uma escalação de privilégio, mas é
-- uma função interna (usada só de dentro de redeem_credits_for_ebook/
-- project) — chamada direta permite um client criar uma linha de
-- credit_transactions com reference_type/reference_id arbitrário sem
-- passar pelo fluxo de resgate de verdade. Fechando por defesa em
-- profundidade, mesmo sem exploit de escalação confirmado nela.
--
-- Nested calls (ex.: confirm_credit_purchase → add_credits) continuam
-- funcionando: dentro de uma function SECURITY DEFINER, chamadas internas
-- rodam com o privilégio do DONO da function chamadora, não do client
-- original — já era assim antes desse fix (add_credits já tinha esse
-- revoke parcial e confirm_credit_purchase já funcionava em produção).
-- Confirmado que nenhum código do frontend chama spend_credits,
-- get_or_create_wallet ou add_credits diretamente via .rpc() — só os 5
-- entry points públicos (redeem_credits_for_ebook/project,
-- confirm/cancel_credit_purchase, admin_adjust_credits).

revoke execute on function public.get_or_create_wallet(uuid) from public;
revoke execute on function public.add_credits(uuid, integer, text, text, text, uuid, uuid) from public;
revoke execute on function public.spend_credits(integer, text, text, text, uuid) from public;
