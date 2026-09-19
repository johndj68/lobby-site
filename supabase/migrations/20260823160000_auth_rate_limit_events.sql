-- Tabela de auditoria para eventos de segurança de autenticação (falhas de
-- login, lockouts, bloqueios de recuperação de senha). Escrita apenas via
-- service_role (routes server-side) — RLS default-deny bloqueia anon/authenticated.
-- Nunca armazena senha nem token.
create table if not exists public.auth_rate_limit_events (
  id         bigint generated always as identity primary key,
  event_type text not null check (event_type in (
    'login_fail', 'admin_login_fail',
    'forgot_password_block'
  )),
  email      text,
  ip         text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists auth_rate_limit_events_created_at_idx
  on public.auth_rate_limit_events (created_at desc);
create index if not exists auth_rate_limit_events_email_idx
  on public.auth_rate_limit_events (email);

alter table public.auth_rate_limit_events enable row level security;
-- Nenhuma policy criada de propósito: RLS default-deny já bloqueia anon/authenticated.
-- Apenas o client admin (service_role, lib/supabase-admin.ts) lê/escreve esta tabela.
