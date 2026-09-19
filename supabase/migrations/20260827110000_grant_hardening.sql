-- Achados por inspeção direta de grants ao vivo (has_function_privilege /
-- information_schema.role_table_grants), não visível só lendo os arquivos
-- de migration — mesma lição do bug já corrigido 2x antes (revoke de
-- PUBLIC não basta quando o Supabase concede EXECUTE direto pra
-- anon/authenticated via default privileges do schema, separado do grant
-- implícito de PUBLIC).

-- get_thread_summaries (20260826120000): revoguei de PUBLIC, mas anon
-- continuava com EXECUTE concedido diretamente (confirmado via
-- has_function_privilege('anon', ..., 'execute') = true, ao vivo). O check
-- interno is_technician(auth.uid()) já bloqueava o resultado pra anon (sem
-- auth.uid()), então não havia vazamento de dado — mas o grant em si
-- continuava mais amplo que o pretendido.
revoke execute on function public.get_thread_summaries() from anon;

-- spend_credits: a migration 20260717152249 documentou isso como "revogado
-- por defesa em profundidade", mas só rodou `revoke ... from public` — nunca
-- revogou de anon/authenticated (diferente de get_or_create_wallet e
-- add_credits, que tiveram os dois revokes). Confirmado ao vivo: anon e
-- authenticated ainda executam spend_credits(integer,text,text,text,uuid)
-- direto via RPC. Chamadas internas (redeem_credits_for_ebook/project)
-- continuam funcionando normalmente — dentro de uma function SECURITY
-- DEFINER, chamadas aninhadas rodam com o privilégio do dono da function
-- chamadora, não do role authenticated/anon original.
revoke execute on function public.spend_credits(integer, text, text, text, uuid) from anon, authenticated;

-- Least privilege adicional: PostgREST/supabase-js nunca emitem TRUNCATE —
-- só SELECT/INSERT/UPDATE/DELETE via REST e chamadas de RPC. TRUNCATE
-- também não é filtrado por RLS (Postgres ignora RLS pra TRUNCATE), então
-- mantê-lo concedido pra anon/authenticated é superfície sem uso real na
-- aplicação, só risco. Revogado em todas as tabelas do schema public.
revoke truncate on all tables in schema public from anon, authenticated;
