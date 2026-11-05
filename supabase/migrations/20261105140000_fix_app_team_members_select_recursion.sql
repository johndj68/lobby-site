-- Achado em teste e2e (Fase 7 audit, 2026-11-05): criar um convite de
-- equipe sempre dava 42P17 "infinite recursion detected in policy for
-- relation app_team_members" — nunca tinha sido exercitado de verdade
-- contra o banco real antes (o bug do AUTH-1, corrigido nesta mesma Fase,
-- quebrava a rota ANTES de chegar no insert; testes unitários sempre
-- mockam o client Supabase, nunca avaliam RLS de verdade).
--
-- Causa: a mesma classe de recursão já corrigida em
-- 20260925151500_fix_team_access_recursion.sql (app_drafts ↔
-- app_team_members), só que num lugar que aquela migration não cobriu —
-- as policies de SELECT de app_team_members e app_team_invitations.
--
-- "View members - owner and team" (app_team_members) tem um branch que
-- consulta app_team_members DENTRO DA PRÓPRIA policy de app_team_members
-- — autorreferência direta, não pela função is_app_team_member (que já
-- existe desde a correção de setembro justamente pra isso). Toda vez que
-- o Postgres precisa decidir se uma linha de app_team_members é visível,
-- reavalia essa mesma policy pra resolver o subselect, que reavalia de
-- novo, pra sempre.
--
-- "View invitations - owner and members" (app_team_invitations) consulta
-- app_team_members direto no segundo branch — herda a mesma recursão.
-- Isso afeta QUALQUER SELECT (e INSERT ... RETURNING, que é como
-- supabase-js faz .insert().select()) nas duas tabelas.
--
-- Fix: os dois branches passam a usar is_app_team_member(), que já roda
-- como SECURITY DEFINER e por isso ignora RLS de app_team_members ao
-- consultá-la internamente — quebra o ciclo sem abrir a tabela a mais
-- ninguém. Mesmo padrão, mesma função, só estendida pras duas policies
-- que faltavam.

drop policy if exists "View members - owner and team" on public.app_team_members;
create policy "View members - owner and team"
  on public.app_team_members for select
  using (
    app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
    or public.is_app_team_member(app_draft_id, auth.uid())
  );

drop policy if exists "View invitations - owner and members" on public.app_team_invitations;
create policy "View invitations - owner and members"
  on public.app_team_invitations for select
  using (
    app_draft_id in (
      select id from public.app_drafts where created_by = auth.uid()
    )
    or public.is_app_team_member(app_draft_id, auth.uid())
  );
